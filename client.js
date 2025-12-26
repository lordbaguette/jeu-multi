// client.js
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const info = document.getElementById("info");

const W = canvas.width;
const H = canvas.height;

let ws;
let myId = null;
let myPlayer = { x: 0, y: 0 };
let otherPlayers = [];
let bullets = [];

let MAP_COLS = 20;
let MAP_ROWS = 15;
let TILE = 40;
let MAP_GRID = null;

const keys = {};
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup",   e => keys[e.code] = false);

// Fire control
let firing = false;
let fireInterval = null;
const FIRE_RATE = 6;
const FIRE_MS = 1000 / FIRE_RATE;

// Dash client cooldown
let lastDashClient = 0;
const DASH_COOLDOWN_MS = 1000;

// souris pour viser
let lastMouse = null;
canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});
canvas.addEventListener("mousedown", e => {
  const rect = canvas.getBoundingClientRect();
  lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  startFiring();
});
window.addEventListener("mouseup", () => stopFiring());

function connect() {
  ws = new WebSocket("wss://jeu-multi.onrender.com");

  ws.onopen = () => {
    console.log("WS ouverte !");
    info.textContent = "Connecté. En attente d'un autre joueur...";
  };

  ws.onmessage = evt => {
    const msg = JSON.parse(evt.data);

    if (msg.type === "welcome") {
      myId = msg.id;
      myPlayer.x = msg.x;
      myPlayer.y = msg.y;
      if (msg.map) {
        MAP_COLS = msg.map.cols;
        MAP_ROWS = msg.map.rows;
        TILE = msg.map.tile;
        MAP_GRID = msg.map.grid;
      }
      info.textContent = "Tu es le joueur " + myId + ". Attends ton ami.";
    }

    else if (msg.type === "state") {
      otherPlayers = msg.players.filter(p => p.id !== myId);
      if (msg.players.length === 2) info.textContent = "Deux joueurs connectés. WASD/ZQSD pour bouger.";
      // correction serveur
      const me = msg.players.find(p => p.id === myId);
      if (me) { myPlayer.x = me.x; myPlayer.y = me.y; }
    }

    else if (msg.type === "bullets") {
      bullets = msg.bullets;
    }

    else if (msg.type === "full") {
      info.textContent = "Serveur plein. (2 joueurs max)";
    }
  };

  ws.onclose = () => {
    info.textContent = "Déconnecté du serveur.";
  };
}
connect();

// Tir continu
function startFiring() {
  if (firing || !myId || !ws || ws.readyState !== WebSocket.OPEN) return;
  firing = true;
  fireInterval = setInterval(() => sendShoot(), FIRE_MS);
  sendShoot();
}
function stopFiring() {
  firing = false;
  if (fireInterval) { clearInterval(fireInterval); fireInterval = null; }
}
function sendShoot() {
  if (!myId || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (!lastMouse) return;
  const dx = lastMouse.x - myPlayer.x;
  const dy = lastMouse.y - myPlayer.y;
  const len = Math.hypot(dx, dy) || 1;
  ws.send(JSON.stringify({ type: "shoot", x: myPlayer.x, y: myPlayer.y, dx: dx / len, dy: dy / len, owner: myId }));
}

// utilitaires map client
function tileAtXY(x, y) {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  if (!MAP_GRID || col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return 1;
  return MAP_GRID[row][col];
}
function isBlockedXY(x, y) { return tileAtXY(x, y) === 1; }

// Game loop
let lastTime = 0;
function loop(ts) {
  const dt = Math.min(0.03, (ts - lastTime) / 1000 || 0.016);
  lastTime = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt) {
  if (!myId) return;

  const speed = 150;
  let dx = 0, dy = 0;
  if (keys["KeyW"] || keys["KeyZ"] || keys["ArrowUp"])    dy -= 1;
  if (keys["KeyS"] || keys["ArrowDown"])                  dy += 1;
  if (keys["KeyA"] || keys["KeyQ"] || keys["ArrowLeft"])  dx -= 1;
  if (keys["KeyD"] || keys["ArrowRight"])                 dx += 1;

  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  // prédiction locale avec collision simple
  const nextX = myPlayer.x + dx * speed * dt;
  const nextY = myPlayer.y + dy * speed * dt;
  if (!isBlockedXY(nextX, nextY)) {
    myPlayer.x = nextX;
    myPlayer.y = nextY;
  }

  // Dash client-side avec cooldown et prédiction
  if ((keys["ShiftLeft"] || keys["ShiftRight"]) && (dx !== 0 || dy !== 0)) {
    const now = Date.now();
    if (now - lastDashClient >= DASH_COOLDOWN_MS) {
      lastDashClient = now;
      const dashPower = 80;
      const tx = myPlayer.x + dx * dashPower;
      const ty = myPlayer.y + dy * dashPower;
      // step check local
      const steps = 8;
      let blocked = false;
      for (let i = 1; i <= steps; i++) {
        const ix = myPlayer.x + (tx - myPlayer.x) * (i / steps);
        const iy = myPlayer.y + (ty - myPlayer.y) * (i / steps);
        if (isBlockedXY(ix, iy)) { blocked = true; break; }
      }
      if (!blocked) {
        myPlayer.x = Math.max(0, Math.min(W, tx));
        myPlayer.y = Math.max(0, Math.min(H, ty));
      } else {
        for (let i = steps; i >= 1; i--) {
          const ix = myPlayer.x + (tx - myPlayer.x) * (i / steps);
          const iy = myPlayer.y + (ty - myPlayer.y) * (i / steps);
          if (!isBlockedXY(ix, iy)) { myPlayer.x = ix; myPlayer.y = iy; break; }
        }
      }
      // envoi dash au serveur
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "dash", dx, dy }));
    }
  }

  // envoi position
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "move", x: myPlayer.x, y: myPlayer.y }));
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);

  // fond
  ctx.fillStyle = "#161925";
  ctx.fillRect(0, 0, W, H);

  // dessiner la map si disponible
  if (MAP_GRID) {
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const v = MAP_GRID[r][c];
        if (v === 1) {
          ctx.fillStyle = "#2b2b2b";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        } else {
          // optionnel : légère grille
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 1;
          ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }
  }

  // arène bordure
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // projectiles
  ctx.fillStyle = "#ff4444";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // autres joueurs
  for (const p of otherPlayers) {
    ctx.fillStyle = p.id === 1 ? "#4caf50" : "#ffb300";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // joueur local
  if (myId) {
    ctx.fillStyle = myId === 1 ? "#4caf50" : "#ffb300";
    ctx.beginPath();
    ctx.arc(myPlayer.x, myPlayer.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // HUD
  ctx.fillStyle = "#ccc";
  ctx.font = "14px monospace";
  ctx.fillText("Toi: " + (myId || "?"), 10, 18);
}

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

const keys = {};
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup",   e => keys[e.code] = false);

// Fire control
let firing = false;
let fireInterval = null;
const FIRE_RATE = 6; // tirs par seconde
const FIRE_MS = 1000 / FIRE_RATE;

// Dash control (client-side cooldown to avoid spamming)
let lastDashClient = 0;
const DASH_COOLDOWN_MS = 1000;

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
      info.textContent = "Tu es le joueur " + myId + ". Attends ton ami.";
    }

    else if (msg.type === "state") {
      otherPlayers = msg.players.filter(p => p.id !== myId);
      if (msg.players.length === 2) info.textContent = "Deux joueurs connectés. WASD/ZQSD pour bouger.";
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

// Tir continu : start/stop interval
function startFiring() {
  if (firing || !myId || !ws || ws.readyState !== WebSocket.OPEN) return;
  firing = true;
  fireInterval = setInterval(() => {
    sendShoot();
  }, FIRE_MS);
  // tir immédiat
  sendShoot();
}

function stopFiring() {
  firing = false;
  if (fireInterval) {
    clearInterval(fireInterval);
    fireInterval = null;
  }
}

function sendShoot() {
  if (!myId || !ws || ws.readyState !== WebSocket.OPEN) return;
  // tir vers la position de la souris stockée
  if (!lastMouse) return;
  const dx = lastMouse.x - myPlayer.x;
  const dy = lastMouse.y - myPlayer.y;
  const len = Math.hypot(dx, dy) || 1;
  ws.send(JSON.stringify({
    type: "shoot",
    x: myPlayer.x,
    y: myPlayer.y,
    dx: dx / len,
    dy: dy / len,
    owner: myId
  }));
}

// souris pour viser
let lastMouse = null;
canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});

// clic maintenu pour tirer
canvas.addEventListener("mousedown", e => {
  const rect = canvas.getBoundingClientRect();
  lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  startFiring();
});
window.addEventListener("mouseup", () => stopFiring());

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

  myPlayer.x += dx * speed * dt;
  myPlayer.y += dy * speed * dt;

  myPlayer.x = Math.max(0, Math.min(W, myPlayer.x));
  myPlayer.y = Math.max(0, Math.min(H, myPlayer.y));

  // Dash : envoi au serveur avec cooldown client
  if ((keys["ShiftLeft"] || keys["ShiftRight"]) && (dx !== 0 || dy !== 0)) {
    const now = Date.now();
    if (now - lastDashClient >= DASH_COOLDOWN_MS) {
      lastDashClient = now;
      // prédiction locale pour réactivité
      const dashPower = 80;
      myPlayer.x += dx * dashPower;
      myPlayer.y += dy * dashPower;
      myPlayer.x = Math.max(0, Math.min(W, myPlayer.x));
      myPlayer.y = Math.max(0, Math.min(H, myPlayer.y));
      // envoi au serveur
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "dash", dx, dy }));
      }
    }
  }

  // Envoi position régulière
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "move", x: myPlayer.x, y: myPlayer.y }));
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#161925";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#444";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Joueur local
  if (myId) {
    ctx.fillStyle = myId === 1 ? "#4caf50" : "#ffb300";
    ctx.beginPath();
    ctx.arc(myPlayer.x, myPlayer.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Autres joueurs
  for (const p of otherPlayers) {
    ctx.fillStyle = p.id === 1 ? "#4caf50" : "#ffb300";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Projectiles
  ctx.fillStyle = "#ff4444";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ccc";
  ctx.font = "14px monospace";
  ctx.fillText("Toi: " + (myId || "?"), 10, 18);
}

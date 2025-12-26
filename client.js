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

// Connexion au serveur WebSocket
function connect() {
  ws = new WebSocket("wss://jeu-multi.onrender.com");

  ws.onopen = () => {
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
      if (msg.players.length === 2) {
        info.textContent = "Deux joueurs connectés. WASD/ZQSD pour bouger.";
      }
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

// Tir au clic
window.addEventListener("mousedown", e => {
  if (!myId) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const dx = mx - myPlayer.x;
  const dy = my - myPlayer.y;
  const len = Math.hypot(dx, dy) || 1;

  ws.send(JSON.stringify({
    type: "shoot",
    x: myPlayer.x,
    y: myPlayer.y,
    dx: dx / len,
    dy: dy / len
  }));
});

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

  // Dash
  if ((keys["ShiftLeft"] || keys["ShiftRight"]) && (dx !== 0 || dy !== 0)) {
    ws.send(JSON.stringify({
      type: "dash",
      dx,
      dy
    }));
  }

  // Envoi position
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "move",
      x: myPlayer.x,
      y: myPlayer.y
    }));
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


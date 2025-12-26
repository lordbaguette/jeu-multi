// client.js
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const info = document.getElementById("info");

const W = canvas.width;
const H = canvas.height;

let ws;
let myId = null;
let myPlayer = { x: 0, y: 0 };
let otherPlayers = []; // { id, x, y }

const keys = {};
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup",   e => keys[e.code] = false);

// Connexion au serveur WebSocket
function connect() {
  ws = new WebSocket("ws://localhost:8080");

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
    } else if (msg.type === "state") {
      otherPlayers = msg.players.filter(p => p.id !== myId);
      if (msg.players.length === 2) {
        info.textContent = "Deux joueurs connectés. WASD/ZQSD pour bouger.";
      }
    } else if (msg.type === "full") {
      info.textContent = "Serveur plein. (2 joueurs max)";
    }
  };

  ws.onclose = () => {
    info.textContent = "Déconnecté du serveur.";
  };
}

connect();

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

  const speed = 150; // pixels/s
  let dx = 0, dy = 0;

  // ZQSD ou WASD
  if (keys["KeyW"] || keys["KeyZ"] || keys["ArrowUp"])    dy -= 1;
  if (keys["KeyS"] || keys["ArrowDown"])                  dy += 1;
  if (keys["KeyA"] || keys["KeyQ"] || keys["ArrowLeft"])  dx -= 1;
  if (keys["KeyD"] || keys["ArrowRight"])                 dx += 1;

  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  myPlayer.x += dx * speed * dt;
  myPlayer.y += dy * speed * dt;

  // limites écran
  myPlayer.x = Math.max(0, Math.min(W, myPlayer.x));
  myPlayer.y = Math.max(0, Math.min(H, myPlayer.y));

  // envoi position au serveur
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

  // fond
  ctx.fillStyle = "#161925";
  ctx.fillRect(0, 0, W, H);

  // “arène” simple
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // joueur local
  if (myId) {
    ctx.fillStyle = myId === 1 ? "#4caf50" : "#ffb300";
    ctx.beginPath();
    ctx.arc(myPlayer.x, myPlayer.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // autre(s) joueur(s)
  for (const p of otherPlayers) {
    ctx.fillStyle = p.id === 1 ? "#4caf50" : "#ffb300";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // pseudo HUD
  ctx.fillStyle = "#ccc";
  ctx.font = "14px monospace";
  ctx.fillText("Toi: " + (myId || "?"), 10, 18);
}

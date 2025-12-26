// server.js
// Serveur WebSocket pour 2 joueurs

const WebSocket = require("ws");

// Render impose un port via process.env.PORT
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });
console.log("Serveur WebSocket démarré sur le port", PORT);

let players = []; // { ws, id, x, y }
let bullets = []; // { x, y, dx, dy }

// Envoi de l'état du jeu
function broadcastState() {
  const state = players.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y
  }));

  const msg = JSON.stringify({
    type: "state",
    players: state
  });

  for (const p of players) {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  }
}

// Mise à jour des projectiles
setInterval(() => {
  // update bullets
  for (const b of bullets) {
    b.x += b.dx * 10;
    b.y += b.dy * 10;
  }

  // remove bullets off-screen
  bullets = bullets.filter(b =>
    b.x >= 0 && b.x <= 800 &&
    b.y >= 0 && b.y <= 600
  );

  // broadcast bullets
  const msg = JSON.stringify({
    type: "bullets",
    bullets
  });

  for (const p of players) {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  }
}, 30);

wss.on("connection", ws => {
  if (players.length >= 2) {
    ws.send(JSON.stringify({ type: "full" }));
    ws.close();
    return;
  }

  const id = players.length === 0 ? 1 : 2;
  const startPos = id === 1 ? { x: 100, y: 100 } : { x: 400, y: 300 };

  const player = { ws, id, x: startPos.x, y: startPos.y };
  players.push(player);

  ws.send(JSON.stringify({
    type: "welcome",
    id,
    x: player.x,
    y: player.y
  }));

  broadcastState();

  ws.on("message", data => {
    try {
      const msg = JSON.parse(data.toString());

      // Déplacement
      if (msg.type === "move") {
        player.x = msg.x;
        player.y = msg.y;
        broadcastState();
      }

      // Tir
      if (msg.type === "shoot") {
        bullets.push({
          x: msg.x,
          y: msg.y,
          dx: msg.dx,
          dy: msg.dy
        });
      }

      // Dash
      if (msg.type === "dash") {
        const dashPower = 80;
        const angle = Math.atan2(msg.dy, msg.dx);
        player.x += Math.cos(angle) * dashPower;
        player.y += Math.sin(angle) * dashPower;
        broadcastState();
      }

    } catch (e) {
      console.error("Erreur message:", e);
    }
  });

  ws.on("close", () => {
    players = players.filter(p => p.ws !== ws);
    broadcastState();
  });
});


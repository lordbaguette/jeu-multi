// server.js
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
console.log("Serveur WebSocket démarré sur le port", PORT);

let players = []; // { ws, id, x, y, lastDash }
let bullets = []; // { x, y, dx, dy, owner, id }

let nextBulletId = 1;
const BULLET_SPEED = 10; // déplacement par tick
const BULLET_TICK_MS = 30;
const DASH_COOLDOWN_MS = 1000;
const WORLD_W = 800;
const WORLD_H = 600;

function broadcastState() {
  const state = players.map(p => ({ id: p.id, x: p.x, y: p.y }));
  const msg = JSON.stringify({ type: "state", players: state });
  for (const p of players) if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
}

function broadcastBullets() {
  const msg = JSON.stringify({ type: "bullets", bullets });
  for (const p of players) if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
}

// Update bullets loop
setInterval(() => {
  for (const b of bullets) {
    b.x += b.dx * BULLET_SPEED;
    b.y += b.dy * BULLET_SPEED;
  }
  bullets = bullets.filter(b => b.x >= 0 && b.x <= WORLD_W && b.y >= 0 && b.y <= WORLD_H);
  broadcastBullets();
}, BULLET_TICK_MS);

wss.on("connection", ws => {
  if (players.length >= 2) {
    ws.send(JSON.stringify({ type: "full" }));
    ws.close();
    return;
  }

  const id = players.length === 0 ? 1 : 2;
  const startPos = id === 1 ? { x: 100, y: 100 } : { x: 400, y: 300 };
  const player = { ws, id, x: startPos.x, y: startPos.y, lastDash: 0 };
  players.push(player);

  ws.send(JSON.stringify({ type: "welcome", id, x: player.x, y: player.y }));
  broadcastState();
  broadcastBullets();

  ws.on("message", data => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "move") {
        player.x = msg.x;
        player.y = msg.y;
        broadcastState();
      }

      else if (msg.type === "shoot") {
        // msg: { x, y, dx, dy, owner }
        bullets.push({
          id: nextBulletId++,
          x: msg.x,
          y: msg.y,
          dx: msg.dx,
          dy: msg.dy,
          owner: msg.owner || player.id
        });
        // broadcastBullets(); // on laisse la boucle périodique s'en charger
      }

      else if (msg.type === "dash") {
        const now = Date.now();
        if (now - player.lastDash < DASH_COOLDOWN_MS) {
          // ignore dash si cooldown
          return;
        }
        player.lastDash = now;

        // msg.dx, msg.dy sont normalisés
        const dashPower = 80;
        const angle = Math.atan2(msg.dy, msg.dx);
        player.x += Math.cos(angle) * dashPower;
        player.y += Math.sin(angle) * dashPower;

        // clamp
        player.x = Math.max(0, Math.min(WORLD_W, player.x));
        player.y = Math.max(0, Math.min(WORLD_H, player.y));

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

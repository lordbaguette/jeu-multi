// server.js
// Serveur WebSocket pour 2 joueurs

const WebSocket = require("ws");

// Render impose un port via process.env.PORT
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });
console.log("Serveur WebSocket démarré sur le port", PORT);

let players = []; // { ws, id, x, y }

function broadcastState() {
  const state = players.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y
  }));
  const msg = JSON.stringify({ type: "state", players: state });
  for (const p of players) {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  }
}

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

  ws.send(JSON.stringify({ type: "welcome", id, x: player.x, y: player.y }));
  broadcastState();

  ws.on("message", data => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "move") {
        player.x = msg.x;
        player.y = msg.y;
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


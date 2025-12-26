// server.js
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
console.log("Serveur WebSocket démarré sur le port", PORT);

// Monde
const TILE = 40;
const WORLD_W = 800;
const WORLD_H = 600;
const MAP_COLS = WORLD_W / TILE; // 20
const MAP_ROWS = WORLD_H / TILE; // 15

// Exemple de map simple 20x15 : 0 = vide, 1 = mur
// Tu peux éditer cette grille pour créer ta map
const MAP = [
  // 20 valeurs par ligne
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,1,1,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,1,1,1,0,0,0,1,1,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Utilitaires
function tileAtXY(x, y) {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return 1;
  return MAP[row][col];
}
function isBlockedXY(x, y) {
  return tileAtXY(x, y) === 1;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Jeu
let players = []; // { ws, id, x, y, lastDash }
let bullets = []; // { id, x, y, dx, dy, owner }
let nextBulletId = 1;

const BULLET_SPEED = 10;
const BULLET_TICK_MS = 30;
const DASH_COOLDOWN_MS = 1000;

// Broadcasts
function broadcastState() {
  const state = players.map(p => ({ id: p.id, x: p.x, y: p.y }));
  const msg = JSON.stringify({ type: "state", players: state });
  for (const p of players) if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
}
function broadcastBullets() {
  const msg = JSON.stringify({ type: "bullets", bullets });
  for (const p of players) if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
}

// Update bullets
setInterval(() => {
  for (const b of bullets) {
    b.x += b.dx * BULLET_SPEED;
    b.y += b.dy * BULLET_SPEED;
  }
  // remove bullets hitting walls or outside
  bullets = bullets.filter(b => {
    if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) return false;
    if (isBlockedXY(b.x, b.y)) return false;
    return true;
  });
  broadcastBullets();
}, BULLET_TICK_MS);

// Connexions
wss.on("connection", ws => {
  if (players.length >= 2) {
    ws.send(JSON.stringify({ type: "full" }));
    ws.close();
    return;
  }

  const id = players.length === 0 ? 1 : 2;
  const startPos = id === 1 ? { x: 100, y: 100 } : { x: 700, y: 500 };
  const player = { ws, id, x: startPos.x, y: startPos.y, lastDash: 0 };
  players.push(player);

  ws.send(JSON.stringify({ type: "welcome", id, x: player.x, y: player.y, map: { cols: MAP_COLS, rows: MAP_ROWS, tile: TILE, grid: MAP } }));
  broadcastState();
  broadcastBullets();

  ws.on("message", data => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "move") {
        // serveur valide la position : si bloquée, ignore
        const nx = clamp(msg.x, 0, WORLD_W);
        const ny = clamp(msg.y, 0, WORLD_H);
        if (!isBlockedXY(nx, ny)) {
          player.x = nx;
          player.y = ny;
          broadcastState();
        } else {
          // ignore, on renverra la position correcte via broadcastState
          broadcastState();
        }
      }

      else if (msg.type === "shoot") {
        // vérif point de départ non bloqué
        if (!isBlockedXY(msg.x, msg.y)) {
          bullets.push({
            id: nextBulletId++,
            x: msg.x,
            y: msg.y,
            dx: msg.dx,
            dy: msg.dy,
            owner: msg.owner || player.id
          });
        }
      }

      else if (msg.type === "dash") {
        const now = Date.now();
        if (now - player.lastDash < DASH_COOLDOWN_MS) return;
        player.lastDash = now;

        // calcule cible et vérifie collision en ligne simple
        const dashPower = 80;
        const tx = player.x + msg.dx * dashPower;
        const ty = player.y + msg.dy * dashPower;

        // simple step check entre start et target pour éviter traverser murs
        const steps = 8;
        let blocked = false;
        for (let i = 1; i <= steps; i++) {
          const ix = player.x + (tx - player.x) * (i / steps);
          const iy = player.y + (ty - player.y) * (i / steps);
          if (isBlockedXY(ix, iy)) { blocked = true; break; }
        }
        if (!blocked) {
          player.x = clamp(tx, 0, WORLD_W);
          player.y = clamp(ty, 0, WORLD_H);
        } else {
          // si bloqué, on recule jusqu'à la dernière position non bloquée
          for (let i = steps; i >= 1; i--) {
            const ix = player.x + (tx - player.x) * (i / steps);
            const iy = player.y + (ty - player.y) * (i / steps);
            if (!isBlockedXY(ix, iy)) {
              player.x = clamp(ix, 0, WORLD_W);
              player.y = clamp(iy, 0, WORLD_H);
              break;
            }
          }
        }
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



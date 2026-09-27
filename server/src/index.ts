import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import { GameRoom } from "./GameRoom";

const PORT = Number(process.env.PORT ?? 2567);
const here = fileURLToPath(new URL(".", import.meta.url));
// Built client (served in production so one process hosts the whole game).
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, "../../client/dist"));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  if (!existsSync(STATIC_DIR)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Client not built. In development open http://localhost:5173");
    return;
  }
  let file = normalize(join(STATIC_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(STATIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  // SPA fallback: invite links like /p/K7F2 load index.html.
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, "index.html");
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const cache = file.includes(`${join(STATIC_DIR, "assets")}`) ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "content-type": type, "cache-control": cache });
  createReadStream(file).pipe(res);
});

const gameServer = new Server({ greet: false, transport: new WebSocketTransport({ server: http }) });
gameServer.define("game", GameRoom).filterBy(["mode", "public"]);

await gameServer.listen(PORT);
console.log(`Millstorm server on http://localhost:${PORT}`);

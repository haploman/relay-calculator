import { DurableObject } from "cloudflare:workers";

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 400;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MIN_INTERVAL_MS = 1_500;

export class TruckerChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
          id INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nickname TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS messages_created_at ON messages(created_at DESC, id DESC);
        INSERT OR IGNORE INTO _sql_schema_migrations (id) VALUES (1);
      `);
    });
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426, headers: { Upgrade: "websocket" } });
    }

    const nickname = new URL(request.url).searchParams.get("name") || "Driver";
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      sessionId: crypto.randomUUID(),
      nickname,
      joinedAt: Date.now(),
      recentTimestamps: [],
    });

    const history = this.ctx.storage.sql.exec(
      "SELECT id, nickname, body, created_at AS createdAt FROM messages ORDER BY created_at DESC, id DESC LIMIT ?",
      MAX_MESSAGES,
    ).toArray().reverse();
    server.send(JSON.stringify({ type: "welcome", history, online: this.ctx.getWebSockets().length }));
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, rawMessage) {
    try {
      if (typeof rawMessage !== "string" || rawMessage.length > 2000) return this.sendError(ws, "That message is too large.");
      const payload = JSON.parse(rawMessage);
      if (!payload || payload.type !== "message" || typeof payload.text !== "string") return this.sendError(ws, "Unsupported chat message.");
      const body = cleanMessage(payload.text);
      if (!body) return this.sendError(ws, "Write a message before sending.");
      if (body.length > MAX_MESSAGE_LENGTH) return this.sendError(ws, `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);

      const state = ws.deserializeAttachment();
      const now = Date.now();
      const recent = (state.recentTimestamps || []).filter((timestamp) => timestamp > now - RATE_WINDOW_MS);
      if (recent.length && now - recent.at(-1) < MIN_INTERVAL_MS) return this.sendError(ws, "Give the room a moment before sending again.");
      if (recent.length >= RATE_LIMIT) return this.sendError(ws, "You have reached the short-term message limit. Try again in a minute.");
      recent.push(now);
      ws.serializeAttachment({ ...state, recentTimestamps: recent });

      const inserted = this.ctx.storage.sql.exec(
        "INSERT INTO messages (nickname, body, created_at) VALUES (?, ?, ?) RETURNING id",
        state.nickname,
        body,
        now,
      ).one();
      this.ctx.storage.sql.exec(
        "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY created_at DESC, id DESC LIMIT ?)",
        MAX_MESSAGES,
      );

      for (const socket of this.ctx.getWebSockets()) {
        const target = socket.deserializeAttachment();
        socket.send(JSON.stringify({
          type: "message",
          message: { id: inserted.id, nickname: state.nickname, body, createdAt: now },
          mine: target?.sessionId === state.sessionId,
        }));
      }
    } catch {
      this.sendError(ws, "That message could not be sent.");
    }
  }

  webSocketClose() {
    this.broadcastPresence();
  }

  webSocketError() {
    this.broadcastPresence();
  }

  sendError(ws, message) {
    try { ws.send(JSON.stringify({ type: "error", message })); } catch { /* Connection already closed. */ }
  }

  broadcastPresence() {
    const sockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({ type: "presence", online: sockets.length });
    for (const socket of sockets) {
      try { socket.send(payload); } catch { /* The runtime will remove closed sockets. */ }
    }
  }
}

function cleanMessage(value) {
  return value.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

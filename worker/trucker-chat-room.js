import { DurableObject } from "cloudflare:workers";

import { cleanMessage, MAX_MESSAGE_LENGTH } from "./chat-input.js";

const MAX_MESSAGES = 100;
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
        CREATE TABLE IF NOT EXISTS mcp_posts (
          request_id TEXT PRIMARY KEY,
          client_key TEXT NOT NULL,
          message_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS mcp_posts_client_time ON mcp_posts(client_key, created_at);
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

    const history = this.readMessages(MAX_MESSAGES);
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

      const message = this.saveMessage(state.nickname, body, now);
      this.broadcastMessage(message, state.sessionId);
    } catch {
      this.sendError(ws, "That message could not be sent.");
    }
  }

  readMessages(limit) {
    return this.ctx.storage.sql.exec(
      "SELECT id, nickname, body, created_at AS createdAt FROM messages ORDER BY created_at DESC, id DESC LIMIT ?",
      limit,
    ).toArray().reverse();
  }

  saveMessage(nickname, body, now) {
    const { id } = this.ctx.storage.sql.exec(
      "INSERT INTO messages (nickname, body, created_at) VALUES (?, ?, ?) RETURNING id",
      nickname, body, now,
    ).one();
    this.ctx.storage.sql.exec(
      "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY created_at DESC, id DESC LIMIT ?)",
      MAX_MESSAGES,
    );
    return { id, nickname, body, createdAt: now };
  }

  postFromMcp(nickname, body, clientKey, requestId) {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const result = this.ctx.storage.transactionSync(() => {
      sql.exec(
        "DELETE FROM mcp_posts WHERE created_at <= ? AND message_id NOT IN (SELECT id FROM messages)",
        now - RATE_WINDOW_MS,
      );
      const existing = sql.exec(
        `SELECT m.id, m.nickname, m.body, m.created_at AS createdAt FROM mcp_posts p
         LEFT JOIN messages m ON m.id = p.message_id WHERE p.request_id = ?`,
        requestId,
      ).toArray()[0];
      if (existing) {
        if (existing.nickname === nickname && existing.body === body) return { message: existing, replay: true };
        return { error: "This request ID has already been used." };
      }
      const rate = sql.exec(
        "SELECT COUNT(*) AS count, MAX(created_at) AS latest FROM mcp_posts WHERE client_key = ? AND created_at > ?",
        clientKey, now - RATE_WINDOW_MS,
      ).one();
      if (rate.count >= RATE_LIMIT || (rate.latest !== null && now - rate.latest < MIN_INTERVAL_MS)) {
        return { error: "Posting too quickly. Wait before trying again." };
      }
      const message = this.saveMessage(nickname, body, now);
      sql.exec("INSERT INTO mcp_posts (request_id, client_key, message_id, created_at) VALUES (?, ?, ?, ?)",
        requestId, clientKey, message.id, now);
      return { message, replay: false };
    });
    if (result.message && !result.replay) this.broadcastMessage(result.message);
    return result;
  }

  broadcastMessage(message, senderId) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const mine = Boolean(senderId && socket.deserializeAttachment()?.sessionId === senderId);
        socket.send(JSON.stringify({ type: "message", message, mine }));
      } catch { /* A closed connection must not interrupt delivery to other drivers. */ }
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

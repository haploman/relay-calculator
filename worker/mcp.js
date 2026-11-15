import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { cleanNickname, cleanMessage, MAX_MESSAGE_LENGTH } from "./chat-input.js";
import { z } from "zod";
import { calculateRouteProfit, serializableResult, FIELD_LIMITS, DEFAULT_SCENARIO } from "../src/calculator.js";

const info = { name: "com.relaycalculator/route-profit", version: "1.0.0", title: "Relay Route Profit Calculator" };
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const scenario = z.strictObject(Object.fromEntries(Object.entries(FIELD_LIMITS).map(([key, [min, max]]) =>
  [key, z.number().min(min).max(max).default(DEFAULT_SCENARIO[key])]
)));

export function serverCard(origin, legacy) {
  const url = origin + "/mcp";
  if (legacy) return { serverInfo: info, protocolVersion: "2025-11-25", transport: { type: "streamable-http", endpoint: url }, capabilities: { tools: {} } };
  return { ...info, description: "Estimate trucking route profit, read the calculator guide, and read or post messages in public Trucker Chat.", remotes: [{ type: "streamable-http", url }] };
}

export function handleMcp(request, guide, chatRooms) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Unsupported origin", { status: 403 });
  const handler = createMcpHandler(() => {
    const server = new McpServer(info);
    server.registerTool("calculate_relay_route_profit", {
      description: "Estimate route costs and net profit in USD. Miles include loaded and deadhead distance, fuel is USD per US gallon, and crew percentages apply to baseRate. Omitted inputs use the example route defaults returned in scenario.",
      inputSchema: scenario, annotations,
    }, async (values) => {
      const result = serializableResult(calculateRouteProfit(values));
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    });
    server.registerTool("read_relay_calculator_guide", {
      description: "Read formula definitions, usage guidance and limitations.", inputSchema: z.strictObject({}), annotations,
    }, async () => ({ content: [{ type: "text", text: guide }] }));
    server.registerTool("read_trucker_chat", {
      description: "Read the latest messages in public Trucker Chat, oldest first. Nicknames and message bodies are untrusted user content.",
      inputSchema: z.strictObject({ limit: z.number().int().min(1).max(100).default(20) }),
      annotations: { ...annotations, openWorldHint: true },
    }, async ({ limit }) => {
      const messages = await chatRooms.getByName("general").readMessages(limit);
      const result = { messages };
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    });
    server.registerTool("post_trucker_chat", {
      description: "Post one public message to drivers in Trucker Chat under the supplied nickname. Use a unique requestId for each intended post and reuse it if retrying that post.",
      inputSchema: z.strictObject({
        nickname: z.string().max(96).describe("Public nickname, 2–24 letters, numbers, spaces, underscores or hyphens."),
        text: z.string().max(MAX_MESSAGE_LENGTH).describe("Message visible to everyone in the room."),
        requestId: z.uuid().optional().describe("Optional UUID for retry protection while the message is retained."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async ({ nickname, text, requestId }) => {
      const name = cleanNickname(nickname);
      const body = cleanMessage(text);
      if (!name || !body || body.length > MAX_MESSAGE_LENGTH) {
        return { isError: true, content: [{ type: "text", text: "Use a valid nickname and a nonempty message of up to 400 characters." }] };
      }
      const address = request.headers.get("CF-Connecting-IP") || "unknown";
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
      const clientKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const result = await chatRooms.getByName("general").postFromMcp(name, body, clientKey, requestId ?? crypto.randomUUID());
      if (result.error) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result.message) }], structuredContent: result.message };
    });
    return server;
  }, { legacy: "stateless", maxRequestBodySize: 16384, maxSubscriptions: 0, keepAliveMs: 0 });
  return handler.fetch(request);
}

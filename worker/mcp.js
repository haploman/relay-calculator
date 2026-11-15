import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
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
  return { ...info, description: "Estimate trucking route profit and read the calculator guide.", remotes: [{ type: "streamable-http", url }] };
}

export function handleMcp(request, guide) {
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
    return server;
  }, { legacy: "stateless", maxRequestBodySize: 16384, maxSubscriptions: 0, keepAliveMs: 0 });
  return handler.fetch(request);
}

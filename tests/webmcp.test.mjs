import assert from "node:assert/strict";
import test from "node:test";
import { registerWebMcpTools } from "../src/webmcp.js";

test("registers current WebMCP tools with truthful annotations", async () => {
  const tools = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { modelContext: { async registerTool(tool) { tools.push(tool); } } },
  });
  try {
    assert.equal(await registerWebMcpTools(), true);
    assert.deepEqual(tools.map((tool) => tool.name), [
      "calculate_relay_route_profit",
      "load_relay_route_scenario",
      "read_relay_calculator_guide",
    ]);
    assert.equal(tools[0].annotations.readOnlyHint, true);
    assert.equal(tools[0].annotations.consequentialHint, false);
    const result = await tools[0].execute({ payout: 2500, loadedMiles: 1000, deadheadMiles: 100 });
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent.totalMiles, 1100);
  } finally {
    delete globalThis.document;
  }
});

test("quietly does nothing when WebMCP is unavailable", async () => {
  assert.equal(await registerWebMcpTools(), false);
});

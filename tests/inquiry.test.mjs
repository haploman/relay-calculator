import test from "node:test";
import assert from "node:assert/strict";
import { inquiry } from "../worker/inquiry.js";

test("forwards validated fields to the dedicated inbox and requires a positive acknowledgment", async () => {
  const req = new Request("https://relaycalculator.com/api/inquiry", { method: "POST", headers: { Origin: "https://relaycalculator.com", "Content-Type": "application/json" } });
  const env = { STUB_INTAKE_KEY: "test-only" };
  const read = async () => ({ name: "Driver", email: "qa@example.invalid", message: "Test", stub_slug: "other" });
  const result = await inquiry(req, env, read, async (url, init) => {
    assert.equal(url, "https://businessstub.com/api/v1/stubs/relay-calculator/inquiries");
    assert.equal(init.headers["X-Stub-Intake-Key"], env.STUB_INTAKE_KEY);
    assert.equal(init.headers["BusinessStub-Integration-Version"], "1");
    assert.equal(JSON.parse(init.body).stub_slug, "relay-calculator");
    return Response.json({ ok: true });
  });
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal((await inquiry(req, env, read, async () => Response.json({}))).status, 502);
  assert.equal((await inquiry(req, env, async () => ({ test_mode: true }), assert.fail)).status, 403);
});

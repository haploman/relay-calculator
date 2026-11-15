import assert from "node:assert/strict";
import test from "node:test";
import { dieselBenchmark } from "../worker/fuel.js";

const sample = "<item><title>Data For 11/09/26</title>Regular Gasoline Retail Price<br/>3.995 .. U.S.<br/>On-Highway Diesel Fuel Retail Price<br/>6.127 .. U.S.<br/>6.206 ... Rocky Mountain<br/>]]></description></item>";

test("uses the requested diesel observation and its survey date", () => {
  assert.deepEqual(dieselBenchmark(sample, "U.S."), { region: "U.S.", price: 6.127, asOf: "2026-11-09" });
  assert.equal(dieselBenchmark(sample, "Rocky Mountain").price, 6.206);
  assert.throws(() => dieselBenchmark(sample, "California"));
  assert.throws(() => dieselBenchmark(sample.replace("On-Highway Diesel Fuel Retail Price", ""), "U.S."));
});

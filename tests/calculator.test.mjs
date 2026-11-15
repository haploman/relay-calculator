import assert from "node:assert/strict";
import test from "node:test";
import { calculateRouteProfit, normalizeScenario, serializableResult } from "../src/calculator.js";

test("calculates route economics from loaded and deadhead miles", () => {
  const result = calculateRouteProfit({
    payout: 1700,
    baseRate: 1700,
    loadedMiles: 1000,
    deadheadMiles: 170,
    fuelPrice: 4.5,
    mpg: 10,
    insurance: 50,
    truckFixed: 170,
    maintenancePerMile: 0.15,
    driverPercentage: 30,
    dispatcherPercentage: 5,
    otherCosts: 0,
    targetMargin: 10,
  });

  assert.equal(result.totalMiles, 1170);
  assert.equal(result.fuelCost, 526.5);
  assert.equal(result.maintenanceCost, 175.5);
  assert.equal(result.totalCosts, 1517);
  assert.equal(result.netProfit, 183);
  assert.equal(result.recommendation, "take");
});

test("returns reprice and skip recommendations at the correct boundaries", () => {
  assert.equal(calculateRouteProfit({ payout: 1700, targetMargin: 15 }).recommendation, "reprice");
  assert.equal(calculateRouteProfit({ payout: 100, baseRate: 1000 }).recommendation, "skip");
});

test("normalization clamps unsafe values and preserves defaults for invalid input", () => {
  const scenario = normalizeScenario({ mpg: 0, payout: "not-a-number", deadheadMiles: 999999 });
  assert.equal(scenario.mpg, 0.1);
  assert.equal(scenario.payout, 1700);
  assert.equal(scenario.deadheadMiles, 25000);
});

test("serialized results are stable to cents", () => {
  const result = serializableResult(calculateRouteProfit({ payout: 2000, loadedMiles: 777, deadheadMiles: 21 }));
  assert.equal(Number.isInteger(result.totalCosts * 100), true);
  assert.equal(result.scenario.loadedMiles, 777);
});

export const DEFAULT_SCENARIO = Object.freeze({
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
  targetMargin: 15,
});

export const FIELD_LIMITS = Object.freeze({
  payout: [0, 1000000],
  baseRate: [0, 1000000],
  loadedMiles: [0, 25000],
  deadheadMiles: [0, 25000],
  fuelPrice: [0, 100],
  mpg: [0.1, 100],
  insurance: [0, 100000],
  truckFixed: [0, 100000],
  maintenancePerMile: [0, 100],
  driverPercentage: [0, 100],
  dispatcherPercentage: [0, 100],
  otherCosts: [0, 1000000],
  targetMargin: [0, 100],
});

export function normalizeScenario(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SCENARIO)) {
    const candidate = Number(source[key]);
    const [minimum, maximum] = FIELD_LIMITS[key];
    result[key] = Number.isFinite(candidate)
      ? Math.min(maximum, Math.max(minimum, candidate))
      : fallback;
  }
  return result;
}

export function calculateRouteProfit(input) {
  const scenario = normalizeScenario(input);
  const totalMiles = scenario.loadedMiles + scenario.deadheadMiles;
  const gallons = totalMiles / scenario.mpg;
  const fuelCost = gallons * scenario.fuelPrice;
  const maintenanceCost = totalMiles * scenario.maintenancePerMile;
  const driverPay = scenario.baseRate * (scenario.driverPercentage / 100);
  const dispatcherPay = scenario.baseRate * (scenario.dispatcherPercentage / 100);
  const fixedCosts = scenario.insurance + scenario.truckFixed + scenario.otherCosts;
  const totalCosts = fuelCost + maintenanceCost + driverPay + dispatcherPay + fixedCosts;
  const netProfit = scenario.payout - totalCosts;
  const margin = scenario.payout > 0 ? (netProfit / scenario.payout) * 100 : 0;
  const netPerTotalMile = totalMiles > 0 ? netProfit / totalMiles : 0;
  const grossPerLoadedMile = scenario.loadedMiles > 0 ? scenario.payout / scenario.loadedMiles : 0;
  const grossPerTotalMile = totalMiles > 0 ? scenario.payout / totalMiles : 0;
  const recommendation = netProfit <= 0
    ? "skip"
    : margin < scenario.targetMargin
      ? "reprice"
      : "take";

  return {
    scenario,
    totalMiles,
    gallons,
    fuelCost,
    maintenanceCost,
    driverPay,
    dispatcherPay,
    fixedCosts,
    totalCosts,
    breakEvenPayout: totalCosts,
    netProfit,
    margin,
    netPerTotalMile,
    grossPerLoadedMile,
    grossPerTotalMile,
    recommendation,
  };
}

export function serializableResult(result) {
  const rounded = {};
  for (const [key, value] of Object.entries(result)) {
    if (key === "scenario" || key === "recommendation") rounded[key] = value;
    else rounded[key] = Math.round(value * 100) / 100;
  }
  return rounded;
}

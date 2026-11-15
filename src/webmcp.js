import { calculateRouteProfit, normalizeScenario, serializableResult } from "./calculator.js";

const numberField = (description, minimum = 0) => ({ type: "number", minimum, description });
const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    payout: numberField("Total route payout including fuel surcharge."),
    baseRate: numberField("Base or linehaul rate used for driver and dispatcher percentage pay."),
    loadedMiles: numberField("Miles from first pickup to final delivery."),
    deadheadMiles: numberField("Unpaid or repositioning miles associated with the route."),
    fuelPrice: numberField("Estimated fuel price per gallon."),
    mpg: numberField("Expected truck fuel economy in miles per gallon.", 0.1),
    insurance: numberField("Insurance cost allocated to this route or day."),
    truckFixed: numberField("Truck payment, rental, or other fixed cost allocated to this route."),
    maintenancePerMile: numberField("Maintenance and tire reserve per total mile."),
    driverPercentage: numberField("Driver pay as a percentage of base rate."),
    dispatcherPercentage: numberField("Dispatcher pay as a percentage of base rate."),
    otherCosts: numberField("Tolls, parking, lodging, or other route costs."),
    targetMargin: numberField("Minimum acceptable net margin percentage."),
  },
};

const outputSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    totalMiles: { type: "number" },
    totalCosts: { type: "number" },
    netProfit: { type: "number" },
    margin: { type: "number" },
    netPerTotalMile: { type: "number" },
    breakEvenPayout: { type: "number" },
    recommendation: { enum: ["take", "reprice", "skip"] },
  },
};

function toolResult(result, message) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: result,
    isError: false,
  };
}

export async function registerWebMcpTools({ onLoadScenario } = {}) {
  const current = typeof document === "object" ? document.modelContext : undefined;
  const legacy = typeof navigator === "object" ? navigator.modelContext : undefined;
  const context = current && typeof current.registerTool === "function" ? current : legacy;
  if (!context || typeof context.registerTool !== "function") return false;

  const calculateTool = {
    name: "calculate_relay_route_profit",
    title: "Calculate Relay route profit",
    description: "Calculate a trucking route's fuel, maintenance, crew pay, total costs, net profit, margin, break-even payout, and take/reprice/skip recommendation. This tool performs local arithmetic only and does not book a load, send data, or make a payment.",
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false },
    execute: async (input = {}) => {
      const result = serializableResult(calculateRouteProfit(input));
      const message = `${result.recommendation.toUpperCase()}: $${result.netProfit.toFixed(2)} net profit, ${result.margin.toFixed(1)}% margin, $${result.netPerTotalMile.toFixed(2)} per total mile.`;
      return toolResult(result, message);
    },
  };

  const loadTool = {
    name: "load_relay_route_scenario",
    title: "Load a route scenario",
    description: "Load route and cost values into the visible Relay Route Profit Calculator so the user can review and edit them. This changes only the current page and does not book a load, submit a form, or transmit the values.",
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: false },
    execute: async (input = {}) => {
      const scenario = normalizeScenario(input);
      if (typeof onLoadScenario === "function") onLoadScenario(scenario);
      const result = serializableResult(calculateRouteProfit(scenario));
      return toolResult(result, "The route scenario is loaded in the visible calculator for user review.");
    },
  };

  const guideTool = {
    name: "read_relay_calculator_guide",
    title: "Read the Relay Calculator guide",
    description: "Read the public guide for the calculator, formula definitions, limitations, and agent skill. This read-only tool uses a fixed same-origin request and does not collect or submit data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: true },
    execute: async (_input = {}, options = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const abort = () => controller.abort();
      options.signal?.addEventListener?.("abort", abort, { once: true });
      try {
        const response = await fetch("/llms.txt", {
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          headers: { Accept: "text/plain, text/markdown;q=0.9" },
          signal: controller.signal,
        });
        const type = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
        if (!response.ok || !["text/plain", "text/markdown"].includes(type)) throw new Error("Guide unavailable");
        const text = await response.text();
        if (!text.trim() || text.length > 262144) throw new Error("Guide unavailable");
        return { content: [{ type: "text", text }], isError: false };
      } catch {
        return { content: [{ type: "text", text: "The public guide is temporarily unavailable. Open /llms.txt in the site." }], isError: true };
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener?.("abort", abort);
      }
    },
  };

  try {
    await context.registerTool(calculateTool);
    await context.registerTool(loadTool);
    await context.registerTool(guideTool);
    return true;
  } catch {
    return false;
  }
}

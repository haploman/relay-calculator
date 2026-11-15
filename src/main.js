import "./styles.css";
import roadIcon from "@tabler/icons/outline/road.svg?raw";
import truckIcon from "@tabler/icons/outline/truck.svg?raw";
import circleCheckIcon from "@tabler/icons/outline/circle-check.svg?raw";
import chartBarIcon from "@tabler/icons/outline/chart-bar.svg?raw";
import calculatorIcon from "@tabler/icons/outline/calculator.svg?raw";
import linkIcon from "@tabler/icons/outline/link.svg?raw";
import circleXIcon from "@tabler/icons/outline/circle-x.svg?raw";
import refreshIcon from "@tabler/icons/outline/refresh.svg?raw";
import messageCircleIcon from "@tabler/icons/outline/message-circle.svg?raw";
import sendIcon from "@tabler/icons/outline/send.svg?raw";
import { calculateRouteProfit, DEFAULT_SCENARIO, normalizeScenario } from "./calculator.js";
import { registerWebMcpTools } from "./webmcp.js";

const icons = { road: roadIcon, truck: truckIcon, "circle-check": circleCheckIcon, "chart-bar": chartBarIcon, calculator: calculatorIcon, link: linkIcon, "circle-x": circleXIcon, refresh: refreshIcon, "message-circle": messageCircleIcon, send: sendIcon };
for (const node of document.querySelectorAll("[data-icon]")) {
  const svg = icons[node.dataset.icon];
  if (svg) node.innerHTML = svg.replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
}

const form = document.querySelector("#profit-form");
const shareButton = document.querySelector("#share-button");
const shareStatus = document.querySelector("#share-status");
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const STORAGE_KEY = "relay-calculator-scenario-v2";
const parameterKeys = { p: "payout", b: "baseRate", lm: "loadedMiles", dm: "deadheadMiles", fp: "fuelPrice", mpg: "mpg", ins: "insurance", tf: "truckFixed", mm: "maintenancePerMile", dp: "driverPercentage", xp: "dispatcherPercentage", oc: "otherCosts", tm: "targetMargin" };

function scenarioFromForm() {
  return normalizeScenario(Object.fromEntries(new FormData(form).entries()));
}

function setScenario(scenario, { persist = true } = {}) {
  const normalized = normalizeScenario(scenario);
  for (const [key, value] of Object.entries(normalized)) {
    const input = form.elements.namedItem(key);
    if (input) input.value = String(value);
  }
  render(normalized);
  if (persist) saveScenario(normalized);
}

function saveScenario(scenario) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario)); } catch { /* Local saves are optional. */ }
}

function loadInitialScenario() {
  const params = new URLSearchParams(location.search);
  const fromUrl = {};
  for (const [short, long] of Object.entries(parameterKeys)) {
    if (params.has(short)) fromUrl[long] = params.get(short);
  }
  if (Object.keys(fromUrl).length) return normalizeScenario({ ...DEFAULT_SCENARIO, ...fromUrl });
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) return normalizeScenario(saved);
  } catch { /* Ignore malformed local data. */ }
  return DEFAULT_SCENARIO;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function render(input) {
  const result = calculateRouteProfit(input);
  const { scenario } = result;
  setText("strip-payout", currency.format(scenario.payout));
  setText("strip-loaded", integer.format(scenario.loadedMiles));
  setText("strip-deadhead", integer.format(scenario.deadheadMiles));
  setText("strip-total", integer.format(result.totalMiles));
  setText("net-profit", currency.format(result.netProfit));
  setText("margin", formatPercent(result.margin));
  setText("net-per-mile", `${currency.format(result.netPerTotalMile)} / mi`);
  setText("break-even", currency.format(result.breakEvenPayout));
  setText("cost-fuel", currency.format(result.fuelCost));
  setText("cost-driver", currency.format(result.driverPay));
  setText("cost-dispatch", currency.format(result.dispatcherPay));
  const operatingCosts = result.maintenanceCost + result.fixedCosts;
  setText("cost-operating", currency.format(operatingCosts));
  setText("math-fuel", currency.format(result.fuelCost));
  setText("math-maintenance", currency.format(result.maintenanceCost));
  setText("math-fixed", currency.format(result.fixedCosts));
  setText("math-driver", currency.format(result.driverPay));
  setText("math-dispatch", currency.format(result.dispatcherPay));
  setText("total-costs", currency.format(result.totalCosts));
  setText("route-math-subtitle", `Based on ${integer.format(result.totalMiles)} total miles.`);
  setText("math-fuel-formula", `${integer.format(result.totalMiles)} mi ÷ ${scenario.mpg} mpg × ${compactCurrency.format(scenario.fuelPrice)}`);
  setText("math-maintenance-formula", `${integer.format(result.totalMiles)} mi × ${compactCurrency.format(scenario.maintenancePerMile)}`);
  setText("math-driver-formula", `${scenario.driverPercentage}% of ${currency.format(scenario.baseRate)} base`);
  setText("math-dispatch-formula", `${scenario.dispatcherPercentage}% of ${currency.format(scenario.baseRate)} base`);

  const costs = [result.fuelCost, result.driverPay, result.dispatcherPay, operatingCosts];
  const ids = ["fuel", "driver", "dispatch", "operating"];
  costs.forEach((cost, index) => {
    const percentage = result.totalCosts > 0 ? (cost / result.totalCosts) * 100 : 0;
    document.getElementById(`bar-${ids[index]}`).style.width = `${percentage}%`;
    setText(`percent-${ids[index]}`, formatPercent(percentage));
  });

  const recommendation = document.getElementById("recommendation");
  const copy = {
    take: ["TAKE", `Meets your ${scenario.targetMargin}% target margin`, "circle-check"],
    reprice: ["REPRICE", `Positive, but below your ${scenario.targetMargin}% target`, "refresh"],
    skip: ["SKIP", "Estimated costs meet or exceed payout", "circle-x"],
  }[result.recommendation];
  recommendation.className = `recommendation recommendation-${result.recommendation}`;
  recommendation.querySelector("[data-icon]").dataset.icon = copy[2];
  recommendation.querySelector("[data-icon]").innerHTML = icons[copy[2]].replace("<svg ", '<svg aria-hidden="true" focusable="false" ');
  recommendation.querySelector("strong").textContent = copy[0];
  recommendation.querySelector("small").textContent = copy[1];
  document.body.dataset.recommendation = result.recommendation;
}

function scenarioUrl(scenario) {
  const url = new URL(location.origin + location.pathname);
  const reverse = Object.fromEntries(Object.entries(parameterKeys).map(([short, long]) => [long, short]));
  for (const [key, value] of Object.entries(scenario)) url.searchParams.set(reverse[key], String(value));
  return url.href;
}

form.addEventListener("input", () => {
  const scenario = scenarioFromForm();
  render(scenario);
  saveScenario(scenario);
  shareStatus.textContent = "";
});

shareButton.addEventListener("click", async () => {
  const url = scenarioUrl(scenarioFromForm());
  shareButton.disabled = true;
  try {
    await navigator.clipboard.writeText(url);
    shareStatus.textContent = "Share link copied. It contains only the calculator values shown here.";
  } catch {
    shareStatus.textContent = "Copying was blocked. Your calculation remains on this device; copy the page address from the browser instead.";
  } finally {
    shareButton.disabled = false;
  }
});

setScenario(loadInitialScenario(), { persist: false });
registerWebMcpTools({ onLoadScenario: (scenario) => setScenario(scenario) }).catch(() => {});

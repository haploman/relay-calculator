import { settings, saveSettings } from "./settings.js";

const zip = document.querySelector("#fuel-zip");
const summary = document.querySelector("#fuel-summary");
const status = document.querySelector("#fuel-status");
const daily = document.querySelector("#fuel-daily");
const price = document.querySelector('[name="fuelPrice"]');
let revision = 0;
let activeLabel = "";

function showPrice(label) {
  activeLabel = label;
  summary.textContent = label + " · $" + Number(price.value).toFixed(3) + "/gal";
}

function locationInput() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location unavailable. Try a ZIP."));
    navigator.geolocation.getCurrentPosition(({ coords }) => resolve({
      lat: Number(coords.latitude.toFixed(2)), lon: Number(coords.longitude.toFixed(2)),
    }), () => reject(new Error("Couldn’t get your location. Try a ZIP.")), { timeout: 8000, maximumAge: 300000 });
  });
}

function applyQuote(quote, render) {
  price.value = String(quote.price);
  showPrice(quote.region + " weekly · " + quote.asOf);
  daily.href = quote.dailyUrl;
  render();
}

async function fetchQuote(input) {
  const response = await fetch("/api/fuel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input), signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(response.status === 400 ? "Location not found. Try a U.S. ZIP." : "Weekly price unavailable.");
  return response.json();
}

export function useScenarioFuel() {
  ++revision;
  showPrice("Route price");
  status.textContent = "";
}

export function setupFuel({ sharedPrice, render, remember }) {
  const save = changes => { if (remember()) saveSettings(changes); };
  const lastArea = () => settings.state ? { state: settings.state } : {};

  async function lookup(mode) {
    const id = ++revision;
    status.textContent = "Checking weekly diesel…";
    try {
      let input = {};
      let source = mode;
      if (mode === "auto") {
        input = lastArea();
        source = settings.areaSource || "auto";
        if (source === "auto" || source === "location") {
          try {
            const permission = await navigator.permissions?.query({ name: "geolocation" });
            if (permission?.state === "granted") {
              input = await locationInput();
              source = "location";
            }
          } catch { /* Use the saved area or the national benchmark. */ }
        }
      } else if (mode === "location") input = await locationInput();
      else if (mode === "zip") {
        if (!/^\d{5}$/.test(zip.value.trim())) throw new Error("Enter a five-digit U.S. ZIP.");
        input = { zip: zip.value.trim() };
      }
      if (id !== revision) return;
      let quote;
      let usedFallback = false;
      try {
        quote = await fetchQuote(input);
      } catch (error) {
        if (id !== revision || mode !== "auto" || !("lat" in input)) throw error;
        quote = await fetchQuote(lastArea());
        usedFallback = true;
      }
      if (id !== revision) return;
      applyQuote(quote, render);
      save({ mode: "weekly", areaSource: source, state: quote.state, quote: {
        price: quote.price, asOf: quote.asOf, state: quote.state, region: quote.region,
      } });
      status.textContent = usedFallback ? "Current location unavailable. Applied the weekly average shown above." : "EIA weekly on-highway diesel. Applied to this load.";
    } catch (error) {
      if (id !== revision) return;
      status.textContent = error.name === "Error" ? error.message : "Weekly price unavailable.";
      summary.textContent = activeLabel + " · $" + Number(price.value).toFixed(3) + "/gal · Lookup failed";
    }
  }

  price.addEventListener("input", () => {
    ++revision;
    showPrice("Custom");
    status.textContent = "";
    if (price.value && price.validity.valid) save({ mode: "manual", manualPrice: Number(price.value) });
  });
  for (const [id, mode] of [["fuel-find", "zip"], ["fuel-locate", "location"], ["fuel-national", "national"]]) {
    document.getElementById(id).addEventListener("click", () => lookup(mode));
  }
  zip.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); lookup("zip"); }
  });

  if (sharedPrice) return useScenarioFuel();
  if (settings.mode === "manual" && Number.isFinite(settings.manualPrice)) {
    price.value = String(settings.manualPrice);
    showPrice("Custom");
    render();
    return;
  }
  const cached = settings.quote;
  if (cached && Number.isFinite(cached.price) && cached.price > 0 && cached.price <= 100 && typeof cached.region === "string") {
    const state = /^[A-Z]{2}$/.test(cached.state) ? cached.state : "";
    applyQuote({ ...cached, dailyUrl: "https://gasprices.aaa.com/" + (state ? "?state=" + state : "") }, render);
  } else showPrice("Provisional price");
  void lookup("auto");
}

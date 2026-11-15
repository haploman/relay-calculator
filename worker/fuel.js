const feed = "https://www.eia.gov/petroleum/gasdiesel/includes/gas_diesel_rss.xml";
const regions = {
  "New England": "CT ME MA NH RI VT",
  "Central Atlantic": "DE DC MD NJ NY PA",
  "Lower Atlantic": "FL GA NC SC VA WV",
  Midwest: "IL IN IA KS KY MI MN MO NE ND OH OK SD TN WI",
  "Gulf Coast": "AL AR LA MS NM TX",
  "Rocky Mountain": "CO ID MT UT WY",
  "West Coast less California": "AZ NV OR WA",
  California: "CA",
};

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

async function get(url, ttl) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6500), cf: { cacheEverything: true, cacheTtl: ttl } });
  if (response.status === 404) throw invalid("No location found. Try another U.S. ZIP.");
  if (!response.ok) throw new Error("Lookup unavailable.");
  return response;
}

async function resolveState(input) {
  if (Object.hasOwn(input, "state")) {
    if (typeof input.state !== "string" || !/^[A-Z]{2}$/.test(input.state)) throw invalid("Invalid state.");
    return input.state;
  }
  if (Object.hasOwn(input, "zip")) {
    if (typeof input.zip !== "string" || !/^\d{5}$/.test(input.zip)) throw invalid("Enter a five-digit U.S. ZIP.");
    const data = await (await get("https://api.zippopotam.us/us/" + input.zip, 86400)).json();
    return data.places?.[0]?.["state abbreviation"];
  }
  if ("lat" in input || "lon" in input) {
    const { lat, lon } = input;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw invalid("Invalid coordinates.");
    const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/coordinates");
    url.search = new URLSearchParams({ x: lon.toFixed(2), y: lat.toFixed(2), benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "States", format: "json" });
    const data = await (await get(url, 86400)).json();
    return data.result?.geographies?.States?.[0]?.STUSAB;
  }
  return "";
}

export function dieselBenchmark(xml, region) {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/i)?.[1] || "";
  const date = item.match(/Data For (\d{2})\/(\d{2})\/(\d{2})/i);
  const rows = item.split(/On-Highway Diesel Fuel Retail Price/i)[1]?.split("]]>")[0] || "";
  const prices = new Map(Array.from(rows.matchAll(/([\d]+\.\d+)\s+\.{2,}\s*([^<\]\r\n]+)/g), match => [match[2].trim(), Number(match[1])]));
  const price = prices.get(region);
  if (!date || !(price > 0 && price <= 100)) throw new Error("EIA benchmark unavailable.");
  return { price, region, asOf: `20${date[3]}-${date[1]}-${date[2]}` };
}

export async function findFuel(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("Invalid fuel lookup.");
  const state = await resolveState(input);
  if (state === undefined || (state && !/^[A-Z]{2}$/.test(state))) throw invalid("No U.S. state found. Try a U.S. ZIP or the national average.");
  const region = Object.keys(regions).find(key => regions[key].split(" ").includes(state)) || "U.S.";
  const xml = await (await get(feed, 3600)).text();
  return { ...dieselBenchmark(xml, region), state, dailyUrl: state && (region !== "U.S." || ["AK", "HI"].includes(state)) ? "https://gasprices.aaa.com/?state=" + state : "https://gasprices.aaa.com/" };
}

const box = document.querySelector("#fuel-lookup");
const zip = box.querySelector("#fuel-zip");
const status = box.querySelector("#fuel-status");
const apply = box.querySelector("#fuel-apply");
const daily = box.querySelector("#fuel-daily");
const find = box.querySelector("#fuel-find");
const locate = box.querySelector("#fuel-locate");
let quote;

function clearQuote() {
  quote = undefined;
  apply.hidden = true;
  daily.href = "https://gasprices.aaa.com/";
  status.textContent = "";
}

function position() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is unavailable. Enter a ZIP instead."));
    navigator.geolocation.getCurrentPosition(({ coords }) => resolve({
      lat: Number(coords.latitude.toFixed(2)), lon: Number(coords.longitude.toFixed(2)),
    }), () => reject(new Error("Couldn’t get your location. Enter a ZIP or use the national average.")), { timeout: 12000, maximumAge: 300000 });
  });
}

async function lookup(useLocation) {
  if (find.disabled) return;
  clearQuote();
  if (!useLocation && zip.value && !/^\d{5}$/.test(zip.value.trim())) {
    status.textContent = "Enter a five-digit U.S. ZIP.";
    zip.focus();
    return;
  }
  zip.disabled = find.disabled = locate.disabled = true;
  status.textContent = useLocation ? "Finding your state…" : "Looking up diesel prices…";
  try {
    const input = useLocation ? await position() : zip.value ? { zip: zip.value.trim() } : {};
    const response = await fetch("/api/fuel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(18000) });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 400 ? data.error : "Fuel lookup unavailable. Try again or open the daily report.");
    quote = data;
    if (useLocation) zip.value = "";
    status.textContent = `${data.state ? data.state + " · " : ""}${data.region} weekly diesel average: $${data.price.toFixed(3)}/gal. EIA, ${data.asOf}.`;
    daily.href = data.dailyUrl;
    apply.hidden = false;
  } catch (error) {
    status.textContent = error.name === "Error" ? error.message : "Lookup unavailable. Try a ZIP or open the daily report.";
  } finally {
    zip.disabled = find.disabled = locate.disabled = false;
  }
}

zip.addEventListener("input", clearQuote);
zip.addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); lookup(false); }
});
find.addEventListener("click", () => lookup(false));
locate.addEventListener("click", () => lookup(true));
apply.addEventListener("click", () => {
  if (!quote) return;
  const price = document.querySelector('[name="fuelPrice"]');
  price.value = String(quote.price);
  price.dispatchEvent(new Event("input", { bubbles: true }));
  price.focus();
});

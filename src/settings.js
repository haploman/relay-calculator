const cookieName = "relay_settings_v1";
export const recurringFields = ["mpg", "insurance", "truckFixed", "maintenancePerMile", "driverPercentage", "dispatcherPercentage", "targetMargin"];

function readSettings() {
  try {
    const entry = document.cookie.split("; ").find(value => value.startsWith(cookieName + "="));
    const parsed = JSON.parse(decodeURIComponent(entry.slice(cookieName.length + 1)));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch { /* First visit or cookies unavailable. */ }
  return {};
}

export const settings = readSettings();

export function saveSettings(changes) {
  Object.assign(settings, changes);
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = cookieName + "=" + encodeURIComponent(JSON.stringify(settings)) +
      "; Path=/; Max-Age=31536000; SameSite=Lax" + secure;
  } catch { /* The calculator also works without persistent cookies. */ }
}

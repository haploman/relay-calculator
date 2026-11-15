const panel = document.querySelector("#app-invite");
const install = panel.querySelector("[data-install]");
const alerts = panel.querySelector("[data-alerts]");
const later = panel.querySelector("[data-later]");
const status = panel.querySelector("[role=status]");
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let promptEvent;
let dismissed = false;
let registration;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(reg => { registration = reg; }).catch(() => {});
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "focus-chat") document.querySelector("#chat-title")?.focus();
  });
}
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); promptEvent = event; });
function refresh() {
  install.hidden = standalone();
  alerts.hidden = !("Notification" in window) || !("serviceWorker" in navigator) || Notification.permission !== "default";
  panel.hidden = dismissed || (install.hidden && alerts.hidden);
}
try { dismissed = Date.now() < Number(localStorage.getItem("relay-app-invite-after")); } catch { /* Optional preference. */ }
setTimeout(refresh, 4000);
later.addEventListener("click", () => {
  dismissed = true;
  panel.hidden = true;
  try { localStorage.setItem("relay-app-invite-after", String(Date.now() + 30 * 86400000)); } catch { /* Optional preference. */ }
});
install.addEventListener("click", async () => {
  if (promptEvent) {
    const event = promptEvent;
    promptEvent = undefined;
    try { await event.prompt(); await event.userChoice; } catch { status.textContent = "Open your browser menu to install the calculator."; }
  } else status.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ? "Open Share and choose Add to Home Screen. Open the installed app to enable chat alerts."
    : "Open your browser menu and choose Install app or Add to Home screen if available.";
});
window.addEventListener("appinstalled", () => { install.hidden = true; if (alerts.hidden) panel.hidden = true; });
alerts.addEventListener("click", async () => {
  try {
    const result = await Notification.requestPermission();
    status.textContent = result === "granted" ? "Chat alerts enabled." : result === "denied" ? "Chat alerts are blocked in your browser settings." : "Chat alerts are off.";
    refresh();
  } catch { status.textContent = "Your browser couldn’t enable alerts here."; }
});
document.addEventListener("relay-chat-message", () => {
  if (document.hidden && registration && window.Notification?.permission === "granted") {
    registration.showNotification("Trucker Chat", { body: "There’s a new message in the room.", tag: "relay-chat", icon: "/app-192.png" }).catch(() => {});
  }
});

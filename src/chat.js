const joinForm = document.getElementById("chat-join-form");
const messageForm = document.getElementById("chat-message-form");
const nicknameInput = document.getElementById("chat-nickname");
const messageInput = document.getElementById("chat-message");
const connectButton = document.getElementById("chat-connect");
const sendButton = document.getElementById("chat-send");
const sendLabel = sendButton.querySelector("span:last-child");
const messages = document.getElementById("chat-messages");
const status = document.getElementById("chat-status");
const online = document.getElementById("chat-online");
const count = document.getElementById("chat-count");
const NICKNAME_KEY = "relay-calculator-chat-nickname-v1";
const LEFT_KEY = "relay-calculator-chat-left-v1";
const validName = /^[\p{L}\p{N} _-]{2,24}$/u;
let socket;
let sending = false;
let retryTimer;
let retryDelay = 1000;
let wantsRoom = false;

try {
  nicknameInput.value = localStorage.getItem(NICKNAME_KEY) || "";
  wantsRoom = validName.test(nicknameInput.value) && localStorage.getItem(LEFT_KEY) !== "yes";
} catch { /* Manual chat also works without browser storage. */ }

function setConnectionState(connected, message) {
  online.parentElement.classList.toggle("connected", connected);
  nicknameInput.disabled = connected || wantsRoom || Boolean(socket);
  connectButton.textContent = connected || wantsRoom || socket ? "Leave room" : "Join room";
  messageInput.disabled = !connected;
  sendButton.disabled = !connected || sending;
  status.textContent = message;
}

function setSending(value) {
  sending = value;
  messageInput.readOnly = value;
  sendButton.disabled = value || socket?.readyState !== WebSocket.OPEN;
  sendLabel.textContent = value ? "Sending…" : "Send";
  messageForm.setAttribute("aria-busy", String(value));
}

function addMessage(message, mine = false) {
  messages.querySelector(".chat-empty")?.remove();
  const article = document.createElement("article");
  article.className = mine ? "chat-message mine" : "chat-message";
  const header = document.createElement("header");
  const name = document.createElement("strong");
  name.textContent = message.nickname;
  const time = document.createElement("time");
  const date = new Date(message.createdAt);
  time.dateTime = date.toISOString();
  time.textContent = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const body = document.createElement("p");
  body.textContent = message.body;
  header.append(name, time);
  article.append(header, body);
  messages.append(article);
  while (messages.children.length > 100) messages.firstElementChild?.remove();
  messages.scrollTop = messages.scrollHeight;
}

function connect(manual = false) {
  if (socket) return;
  clearTimeout(retryTimer);
  const nickname = nicknameInput.value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!validName.test(nickname)) {
    status.textContent = "Use 2–24 letters, numbers, spaces, underscores, or hyphens.";
    nicknameInput.focus();
    return;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/api/chat/general?name=${encodeURIComponent(nickname)}`);

  const current = socket;
  setConnectionState(false, "Connecting…");
  socket.addEventListener("open", () => {
    if (current !== socket) return;
    wantsRoom = true;
    retryDelay = 1000;
    try {
      localStorage.setItem(NICKNAME_KEY, nickname);
      if (manual) localStorage.removeItem(LEFT_KEY);
    } catch { /* Keep the session working when storage is unavailable. */ }
    setConnectionState(true, `Connected as ${nickname}.`);
    if (manual) messageInput.focus();
  });

  socket.addEventListener("message", (event) => {
    if (current !== socket) return;
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.type === "welcome") {
      messages.replaceChildren();
      if (payload.history.length === 0) {
        const empty = document.createElement("p");
        empty.className = "chat-empty";
        empty.textContent = "No messages yet. Start the route talk.";
        messages.append(empty);
      } else payload.history.forEach((message) => addMessage(message));
      online.textContent = `${payload.online} online`;
    } else if (payload.type === "message") {
      addMessage(payload.message, payload.mine);
      if (!payload.mine) document.dispatchEvent(new Event("relay-chat-message"));
      if (payload.mine) {
        messageInput.value = "";
        count.textContent = "0";
        setSending(false);
        status.textContent = "Sent.";
      }
    } else if (payload.type === "presence") {
      online.textContent = `${payload.online} online`;
    } else if (payload.type === "error") {
      setSending(false);
      status.textContent = payload.message;
    }
  });

  socket.addEventListener("close", () => {
    if (current !== socket) return;
    socket = null;
    setSending(false);
    online.textContent = "Offline";
    setConnectionState(false, wantsRoom ? "Disconnected. Rejoining…" : "Could not join. Try again.");
    if (wantsRoom && navigator.onLine) {
      retryTimer = setTimeout(resume, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }
  });
}

function disconnect(message) {
  clearTimeout(retryTimer);
  const current = socket;
  socket = null;
  current?.close(1000, "Leaving chat");
  setSending(false);
  setConnectionState(false, message);
  online.textContent = "Offline";
}

function leave() {
  wantsRoom = false;
  retryDelay = 1000;
  disconnect("Left the room.");
}

function resume() {
  if (wantsRoom && !socket && navigator.onLine) connect();
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (wantsRoom || socket) {
    try { localStorage.setItem(LEFT_KEY, "yes"); } catch { /* Leave for this visit. */ }
    leave();
  } else {
    connect(true);
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === LEFT_KEY && event.newValue === "yes") leave();
});
window.addEventListener("pagehide", () => disconnect("Offline"));
window.addEventListener("pageshow", resume);
window.addEventListener("online", resume);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resume();
});
if (wantsRoom) {
  setConnectionState(false, "Waiting to rejoin…");
  resume();
}

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (sending || socket?.readyState !== WebSocket.OPEN) return;
  const text = messageInput.value.trim();
  if (!text) { status.textContent = "Write a message before sending."; return; }
  setSending(true);
  socket.send(JSON.stringify({ type: "message", text }));
});

messageInput.addEventListener("input", () => {
  count.textContent = String(messageInput.value.length);
  if (!sending) status.textContent = socket?.readyState === WebSocket.OPEN ? "Connected." : "Not connected.";
});

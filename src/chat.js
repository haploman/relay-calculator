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
let socket;
let sending = false;
let manuallyClosed = false;

try { nicknameInput.value = localStorage.getItem(NICKNAME_KEY) || ""; } catch { /* Optional convenience only. */ }

function setConnectionState(connected, message) {
  nicknameInput.disabled = connected;
  connectButton.textContent = connected ? "Leave room" : "Join room";
  messageInput.disabled = !connected;
  sendButton.disabled = !connected || sending;
  status.textContent = message;
  if (connected) messageInput.focus();
}

function setSending(value) {
  sending = value;
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

function connect() {
  const nickname = nicknameInput.value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!/^[\p{L}\p{N} _-]{2,24}$/u.test(nickname)) {
    status.textContent = "Use 2–24 letters, numbers, spaces, underscores, or hyphens.";
    nicknameInput.focus();
    return;
  }
  manuallyClosed = false;
  connectButton.disabled = true;
  status.textContent = "Connecting…";
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/api/chat/general?name=${encodeURIComponent(nickname)}`);

  socket.addEventListener("open", () => {
    connectButton.disabled = false;
    try { localStorage.setItem(NICKNAME_KEY, nickname); } catch { /* Optional convenience only. */ }
    setConnectionState(true, `Connected as ${nickname}.`);
  });

  socket.addEventListener("message", (event) => {
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
    connectButton.disabled = false;
    setSending(false);
    setConnectionState(false, manuallyClosed ? "Left the room." : "Chat disconnected. Join again when ready.");
    online.textContent = "Offline";
  });
  socket.addEventListener("error", () => { status.textContent = "Chat could not connect."; });
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (socket?.readyState === WebSocket.OPEN) {
    manuallyClosed = true;
    socket.close(1000, "Visitor left");
  } else if (!connectButton.disabled) connect();
});

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

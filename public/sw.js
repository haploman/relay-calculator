self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const chat = windows.find(client => client.id === event.notification.data?.clientId)
      || windows.find(client => new URL(client.url).pathname === "/");
    if (chat) {
      await chat.focus();
      chat.postMessage({ type: "focus-chat" });
    } else await clients.openWindow("/#chat-title");
  })());
});
self.addEventListener("activate", event => event.waitUntil(clients.claim()));

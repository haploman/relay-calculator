export const MAX_MESSAGE_LENGTH = 400;

export function cleanNickname(value) {
  const nickname = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return nickname.length >= 2 && nickname.length <= 24 && /^[\p{L}\p{N} _-]+$/u.test(nickname) ? nickname : "";
}

export function cleanMessage(value) {
  return value.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

import { Cache } from "@raycast/api";
import { Message } from "./api";

const cache = new Cache();

export function seedMessageCache(roomId: string, message: Message) {
  const cacheKey = `messages-${roomId}`;
  const existing: Message[] = (() => {
    try {
      const raw = cache.get(cacheKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();
  cache.set(cacheKey, JSON.stringify([message, ...existing]));
}

export function updateMessageCache(roomId: string, messageId: string, newText: string) {
  const cacheKey = `messages-${roomId}`;
  try {
    const raw = cache.get(cacheKey);
    if (!raw) return;
    const messages: Message[] = JSON.parse(raw);
    const updated = messages.map((m) => (m.id === messageId ? { ...m, text: newText } : m));
    cache.set(cacheKey, JSON.stringify(updated));
  } catch {
    // skip
  }
}

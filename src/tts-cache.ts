type CacheItem = {
  text: string;
  createdAt: number;
};

const TTL_MS = 1000 * 60 * 30;
const MAX_ITEMS = 200;
const ttsTextCache = new Map<string, CacheItem>();

function cleanupCache(now: number) {
  for (const [key, value] of ttsTextCache.entries()) {
    if (now - value.createdAt > TTL_MS) {
      ttsTextCache.delete(key);
    }
  }

  if (ttsTextCache.size > MAX_ITEMS) {
    const entries = Array.from(ttsTextCache.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );
    const removeCount = ttsTextCache.size - MAX_ITEMS;
    for (let index = 0; index < removeCount; index++) {
      ttsTextCache.delete(entries[index][0]);
    }
  }
}

export function putTtsText(text: string): string {
  const now = Date.now();
  cleanupCache(now);

  const id = crypto.randomUUID();
  ttsTextCache.set(id, {
    text,
    createdAt: now
  });

  return id;
}

export function getTtsText(id: string): string | undefined {
  const now = Date.now();
  const item = ttsTextCache.get(id);
  if (!item) return undefined;

  if (now - item.createdAt > TTL_MS) {
    ttsTextCache.delete(id);
    return undefined;
  }

  return item.text;
}

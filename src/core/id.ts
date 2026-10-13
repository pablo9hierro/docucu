let counter = 0;

/** Identificador curto e único. Usa crypto quando disponível (navegador e Node 19+). */
export function uid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 16);
  counter = (counter + 1) % 1_000_000;
  return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 8);
}

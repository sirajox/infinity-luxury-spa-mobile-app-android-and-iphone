import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    // Mirror SecureStore's per-value size limit so oversized writes fail the test.
    if (new TextEncoder().encode(v).length > 2048) throw new Error('Value is larger than 2048 bytes');
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => void store.delete(k),
}));

const { secureAuthStorage } = await import('./secureStorage');

describe('secure auth storage', () => {
  beforeEach(() => store.clear());

  it('round-trips a session larger than the platform value limit by chunking', async () => {
    const session = JSON.stringify({ access_token: 'a'.repeat(3000), refresh_token: 'r'.repeat(500), user: { id: 'u1', email: 'x@y.z' } });
    await secureAuthStorage.setItem('sb-project-auth-token', session);
    expect(await secureAuthStorage.getItem('sb-project-auth-token')).toBe(session);
    expect([...store.keys()].some((k) => k.endsWith('.1'))).toBe(true);
  });

  it('overwrites previous values without leaving stale chunks', async () => {
    await secureAuthStorage.setItem('k', 'x'.repeat(5000));
    await secureAuthStorage.setItem('k', 'short');
    expect(await secureAuthStorage.getItem('k')).toBe('short');
    expect(store.size).toBe(2); // one chunk + the count marker
  });

  it('treats a partial write as signed out instead of returning corrupt JSON', async () => {
    await secureAuthStorage.setItem('k', 'y'.repeat(4000));
    store.delete('k.1');
    expect(await secureAuthStorage.getItem('k')).toBeNull();
  });

  it('removes every chunk', async () => {
    await secureAuthStorage.setItem('k', 'z'.repeat(5000));
    await secureAuthStorage.removeItem('k');
    expect(store.size).toBe(0);
    expect(await secureAuthStorage.getItem('k')).toBeNull();
  });

  it('sanitises keys that SecureStore would reject', async () => {
    await secureAuthStorage.setItem('sb:project/auth token', 'v');
    expect([...store.keys()].every((k) => /^[a-zA-Z0-9._-]+$/.test(k))).toBe(true);
  });
});

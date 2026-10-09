import * as SecureStore from 'expo-secure-store';

/**
 * Supabase Auth storage backed by the OS keychain/keystore. SecureStore limits values to ~2KB while a
 * session JSON is larger, so values are split into chunks. Tokens never touch unencrypted storage.
 */
const CHUNK = 1800;

const safeKey = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, '_');

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part === null) return null; // corrupt/partial write: treat as signed out
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await secureAuthStorage.removeItem(key);
    const chunks = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${k}.${i}`, chunks[i] ?? '');
    }
    await SecureStore.setItemAsync(`${k}.n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    for (let i = 0; i < Number(count ?? 0); i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};

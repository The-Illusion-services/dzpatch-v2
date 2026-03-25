import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// SecureStore has a 2048-byte limit per value.
// We chunk large values across multiple keys to stay under the limit.
const CHUNK_SIZE = 1800; // bytes, safely under limit
const chunkKey = (key: string, i: number) => `${key}.chunk_${i}`;

const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    // Try chunked first
    const countStr = await SecureStore.getItemAsync(`${key}.chunks`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
        if (chunk == null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    }
    // Fallback: value stored directly (small enough)
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      // Small enough — store directly, clean up any old chunks
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(`${key}.chunks`);
      return;
    }
    // Split into chunks
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    // Remove direct key if it existed before
    await SecureStore.deleteItemAsync(key);
    await SecureStore.setItemAsync(`${key}.chunks`, String(chunks.length));
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(chunkKey(key, i), c)));
  },

  async removeItem(key: string): Promise<void> {
    const countStr = await SecureStore.getItemAsync(`${key}.chunks`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      await Promise.all([
        SecureStore.deleteItemAsync(`${key}.chunks`),
        ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))),
      ]);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

// Use chunked SecureStore on native, localStorage on web
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') return Promise.resolve(localStorage.getItem(key));
    return LargeSecureStore.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return Promise.resolve(); }
    return LargeSecureStore.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return Promise.resolve(); }
    return LargeSecureStore.removeItem(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

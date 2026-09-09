/**
 * Storage.ts
 *
 * Safe localStorage wrapper with JSON serialization and fallback handling.
 */

export class Storage {
  public static get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      return JSON.parse(item) as T;
    } catch (err) {
      console.warn(`[Storage] Failed to read key "${key}":`, err);
      return defaultValue;
    }
  }

  public static set<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[Storage] Failed to write key "${key}":`, err);
      return false;
    }
  }

  public static remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[Storage] Failed to remove key "${key}":`, err);
    }
  }
}


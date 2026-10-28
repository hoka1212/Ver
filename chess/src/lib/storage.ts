import { useSyncExternalStore } from 'react'

export const STORAGE_PREFIX = 'chess-trainer/'

export interface Store<T> {
  key: string
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(listener: () => void): () => void
  reset(): void
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Приватный режим или переполнение — работаем только в памяти.
  }
}

/**
 * Хранилище, синхронизированное с localStorage.
 * `normalize` дополняет сохранённые данные недостающими полями после обновлений приложения.
 */
export function createStore<T>(name: string, initial: T, normalize: (raw: unknown) => T = (raw) => raw as T): Store<T> {
  const key = STORAGE_PREFIX + name
  const listeners = new Set<() => void>()

  const load = (): T => {
    const raw = safeRead(key)
    if (raw === null) return initial
    try {
      return normalize(JSON.parse(raw))
    } catch {
      return initial
    }
  }

  let state = load()
  const emit = () => listeners.forEach((l) => l())

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        state = load()
        emit()
      }
    })
  }

  return {
    key,
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      safeWrite(key, JSON.stringify(state))
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reset() {
      state = initial
      safeWrite(key, null)
      emit()
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Объединяет сохранённый объект с объектом по умолчанию (для простых плоских настроек). */
export function withDefaults<T extends object>(defaults: T) {
  return (raw: unknown): T => (raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...defaults, ...(raw as Partial<T>) } : defaults)
}

/** Ключ дня в локальном времени: 2026-10-28. */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

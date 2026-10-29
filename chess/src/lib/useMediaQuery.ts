import { useSyncExternalStore } from 'react'

/** Совпадает ли медиазапрос (например, '(min-width: 1024px)'), с подпиской на изменения. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

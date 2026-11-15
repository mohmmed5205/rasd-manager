import { useSyncExternalStore } from 'react'

const query = '(max-width: 900px)'
const snapshot = (): boolean => window.matchMedia(query).matches
const subscribe = (callback: () => void): (() => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

// Inline styles cannot contain media queries; use the browser's media API.
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

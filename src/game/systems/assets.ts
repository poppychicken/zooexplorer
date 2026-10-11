import { useSyncExternalStore } from 'react'

/**
 * public/assets/creatures/index.json is written by scripts/generate_assets/generate.py and lists
 * which creatures have a generated GLB model and PNG icon. Missing entries use placeholders.
 */
export interface AssetIndex {
  models: Set<string>
  icons: Set<string>
}

let index: AssetIndex = { models: new Set(), icons: new Set() }
const listeners = new Set<() => void>()
let started = false

function load() {
  if (started) return
  started = true
  fetch(`${import.meta.env.BASE_URL}assets/creatures/index.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { models?: string[]; icons?: string[] } | null) => {
      if (!data) return
      index = { models: new Set(data.models ?? []), icons: new Set(data.icons ?? []) }
      listeners.forEach((l) => l())
    })
    .catch(() => {})
}

export function useAssetIndex(): AssetIndex {
  load()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => index,
  )
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BiomeId } from '../data/creatures'
import { CREATURE_BY_ID } from '../data/creatures'
import { BASIC_BAIT_PER_EXPEDITION, SHOP_ITEM_BY_ID, STARTING_MONEY, type NetTier, type ShopItemId } from '../data/shop'
import { incomePerMinute, offlineEarnings, rehomingFee } from '../systems/economy'

/** Persisted save data. */
export interface SaveState {
  money: number
  netTier: NetTier
  premiumBait: number
  owned: { tracker: boolean; buggy: boolean }
  /** Species id → number captured. One exhibit per species. */
  captured: Record<string, number>
  discovered: Record<string, true>
  /** Last time income was credited (ms since epoch); drives offline earnings. */
  lastSeen: number
  mouseSensitivity: number
}

export type CaptureResult = { kind: 'new' } | { kind: 'duplicate'; fee: number }

interface Actions {
  tick: (now: number) => void
  collectOffline: (now: number) => { amount: number; elapsedMs: number; capped: boolean }
  discover: (id: string) => boolean
  capture: (id: string) => CaptureResult
  canBuy: (id: ShopItemId) => { ok: boolean; reason?: string }
  buy: (id: ShopItemId) => boolean
  usePremiumBait: () => boolean
  setSensitivity: (v: number) => void
  resetSave: () => void
}

const initialSave = (): SaveState => ({
  money: STARTING_MONEY,
  netTier: 1,
  premiumBait: 0,
  owned: { tracker: false, buggy: false },
  captured: {},
  discovered: {},
  lastSeen: Date.now(),
  mouseSensitivity: 1,
})

export const useGame = create<SaveState & Actions>()(
  persist(
    (set, get) => ({
      ...initialSave(),

      tick: (now) => {
        const { captured, lastSeen } = get()
        const dt = Math.max(0, Math.min(now - lastSeen, 5000))
        set({ money: get().money + (incomePerMinute(captured) * dt) / 60000, lastSeen: now })
      },

      collectOffline: (now) => {
        const { captured, lastSeen, money } = get()
        const result = offlineEarnings(captured, lastSeen, now)
        set({ money: money + result.amount, lastSeen: now })
        return result
      },

      discover: (id) => {
        if (get().discovered[id]) return false
        set({ discovered: { ...get().discovered, [id]: true } })
        return true
      },

      capture: (id) => {
        const captured = get().captured
        const count = captured[id] ?? 0
        const discovered = { ...get().discovered, [id]: true as const }
        if (count === 0) {
          set({ captured: { ...captured, [id]: 1 }, discovered })
          return { kind: 'new' }
        }
        const fee = rehomingFee(id)
        set({ captured: { ...captured, [id]: count + 1 }, discovered, money: get().money + fee })
        return { kind: 'duplicate', fee }
      },

      canBuy: (id) => {
        const s = get()
        const item = SHOP_ITEM_BY_ID[id]
        if (id === 'net_mk2' && s.netTier >= 2) return { ok: false, reason: 'Owned' }
        if (id === 'net_mk3' && s.netTier >= 3) return { ok: false, reason: 'Owned' }
        if (id === 'net_mk3' && s.netTier < 2) return { ok: false, reason: 'Needs Net Mk II' }
        if (id === 'tracker' && s.owned.tracker) return { ok: false, reason: 'Owned' }
        if (id === 'buggy' && s.owned.buggy) return { ok: false, reason: 'Owned' }
        if (s.money < item.price) return { ok: false, reason: 'Not enough money' }
        return { ok: true }
      },

      buy: (id) => {
        if (!get().canBuy(id).ok) return false
        const s = get()
        const money = s.money - SHOP_ITEM_BY_ID[id].price
        switch (id) {
          case 'net_mk2':
            set({ money, netTier: 2 })
            break
          case 'net_mk3':
            set({ money, netTier: 3 })
            break
          case 'premium_bait':
            set({ money, premiumBait: s.premiumBait + 5 })
            break
          case 'tracker':
            set({ money, owned: { ...s.owned, tracker: true } })
            break
          case 'buggy':
            set({ money, owned: { ...s.owned, buggy: true } })
            break
        }
        return true
      },

      usePremiumBait: () => {
        const n = get().premiumBait
        if (n <= 0) return false
        set({ premiumBait: n - 1 })
        return true
      },

      setSensitivity: (v) => set({ mouseSensitivity: v }),

      resetSave: () => set({ ...initialSave() }),
    }),
    {
      name: 'zoo-explorer-save',
      version: 1,
      partialize: (s): SaveState => ({
        money: s.money,
        netTier: s.netTier,
        premiumBait: s.premiumBait,
        owned: s.owned,
        captured: s.captured,
        discovered: s.discovered,
        lastSeen: s.lastSeen,
        mouseSensitivity: s.mouseSensitivity,
      }),
    },
  ),
)

// --- Session (not persisted) ---------------------------------------------

export type Location = { kind: 'hub' } | { kind: 'biome'; biome: BiomeId }
export type Modal = null | 'gate' | 'shop' | 'journal' | 'pause' | { kind: 'minigame'; uid: number; creatureId: string }

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'good' | 'bad' | 'legendary'
}

interface Session {
  location: Location
  /** Increments on every scene change so scenes remount cleanly. */
  visit: number
  /** False until the player dismisses the title screen. */
  started: boolean
  modal: Modal
  locked: boolean
  prompt: string | null
  basicBait: number
  toasts: Toast[]
  soundLog: { id: number; text: string }[]
  netReadyAt: number
  goTo: (loc: Location) => void
  openModal: (m: Modal) => void
  closeModal: () => void
  setLocked: (v: boolean) => void
  setPrompt: (p: string | null) => void
  toast: (text: string, tone?: Toast['tone']) => void
  logSound: (text: string) => void
  useBasicBait: () => boolean
  setNetReadyAt: (t: number) => void
}

let nextId = 1

export const useSession = create<Session>()((set, get) => ({
  location: { kind: 'hub' },
  visit: 0,
  started: false,
  modal: 'pause',
  locked: false,
  prompt: null,
  basicBait: 0,
  toasts: [],
  soundLog: [],
  netReadyAt: 0,
  goTo: (location) =>
    set({
      location,
      visit: get().visit + 1,
      modal: null,
      prompt: null,
      soundLog: [],
      basicBait: location.kind === 'biome' ? BASIC_BAIT_PER_EXPEDITION : 0,
    }),
  openModal: (modal) => {
    set({ modal })
    if (document.pointerLockElement) document.exitPointerLock()
  },
  closeModal: () => set({ modal: null }),
  setLocked: (locked) => set({ locked }),
  setPrompt: (prompt) => {
    if (get().prompt !== prompt) set({ prompt })
  },
  toast: (text, tone = 'info') => {
    const id = nextId++
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-4) })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4000)
  },
  logSound: (text) => {
    const id = nextId++
    set({ soundLog: [...get().soundLog, { id, text }].slice(-3) })
    setTimeout(() => set({ soundLog: get().soundLog.filter((t) => t.id !== id) }), 5000)
  },
  useBasicBait: () => {
    const n = get().basicBait
    if (n <= 0) return false
    set({ basicBait: n - 1 })
    return true
  },
  setNetReadyAt: (netReadyAt) => set({ netReadyAt }),
}))

export const creatureName = (id: string) => CREATURE_BY_ID[id]?.name ?? id

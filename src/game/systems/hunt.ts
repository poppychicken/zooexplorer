import { Vector3 } from 'three'
import { CREATURE_BY_ID } from '../data/creatures'
import { BAIT } from '../data/shop'
import { useGame, useSession } from '../state/store'
import { playUi } from './audio'
import { captureChance, rollCapture } from './capture'
import { formatPrice, ticketPrice } from './economy'
import { baits, creatures, now, nextUid, player, type CreatureRuntime } from './world'

/** How far ahead of the player bait lands, in metres. */
export const BAIT_TOSS = 7

/** Seconds between net throws. */
export const NET_COOLDOWN = 1.2

export interface NetShot {
  id: number
  origin: [number, number, number]
  velocity: [number, number, number]
}

type NetListener = (shot: NetShot) => void
const netListeners = new Set<NetListener>()
export const onNetThrown = (l: NetListener) => {
  netListeners.add(l)
  return () => void netListeners.delete(l)
}

export function throwNet(): boolean {
  const session = useSession.getState()
  if (performance.now() < session.netReadyAt) return false
  session.setNetReadyAt(performance.now() + NET_COOLDOWN * 1000)
  const dir = player.forward.clone()
  // Aim slightly above the crosshair so the arc lands where you look at mid-range.
  dir.y += 0.12
  dir.normalize()
  const speed = 16
  const origin = player.eye.clone().addScaledVector(player.forward, 0.8)
  origin.y -= 0.15
  netListeners.forEach((l) => l({ id: nextUid(), origin: origin.toArray(), velocity: dir.multiplyScalar(speed).toArray() }))
  playUi('throw')
  return true
}

export function dropBait(): boolean {
  const game = useGame.getState()
  const session = useSession.getState()
  const premium = game.premiumBait > 0
  if (premium) game.usePremiumBait()
  else if (!session.useBasicBait()) {
    session.toast('Out of bait. Buy Premium Bait at the outfitter.', 'bad')
    return false
  }
  const def = BAIT[premium ? 'premium' : 'basic']
  const flat = new Vector3(player.forward.x, 0, player.forward.z).normalize()
  // Tossed far enough that a creature coming to eat it stays outside its (reduced) detection range.
  const pos = player.position.clone().addScaledVector(flat, BAIT_TOSS)
  pos.y = 0
  const id = nextUid()
  baits.set(id, { id, position: pos, premium, expiresAt: now() + def.lifetimeSeconds })
  playUi('bait')
  session.toast(premium ? 'Premium bait tossed. Keep still and wait.' : 'Bait tossed. Keep still and wait.', 'info')
  return true
}

export function isCalm(c: CreatureRuntime): boolean {
  return c.mode === 'eating' || c.mode === 'calm'
}

/** The net touched a creature: roll for normal creatures, start the mini-game for legendaries. */
export function resolveNetHit(uid: number) {
  const c = creatures.get(uid)
  if (!c || c.mode === 'captured' || c.mode === 'struggling') return
  const def = CREATURE_BY_ID[c.creatureId]
  const session = useSession.getState()
  if (def.rarity === 'legendary') {
    c.mode = 'struggling'
    session.openModal({ kind: 'minigame', uid, creatureId: c.creatureId })
    return
  }
  const baited = isCalm(c)
  const chance = captureChance(def.rarity, useGame.getState().netTier, baited)
  if (rollCapture(chance)) {
    completeCapture(c)
  } else {
    playUi('miss')
    session.toast(`The ${def.name} slipped out of the net! (${Math.round(chance * 100)}% chance)`, 'bad')
    startFlee(c, 6)
  }
}

export function completeCapture(c: CreatureRuntime) {
  const def = CREATURE_BY_ID[c.creatureId]
  c.mode = 'captured'
  const result = useGame.getState().capture(c.creatureId)
  playUi('catch')
  const session = useSession.getState()
  if (result.kind === 'new') {
    session.toast(`Captured a ${def.name}! A new exhibit is open, and tickets now cost ${formatPrice(ticketPrice(useGame.getState().captured))} (+${formatPrice(def.ticket)}).`, def.rarity === 'legendary' ? 'legendary' : 'good')
  } else {
    session.toast(`Captured another ${def.name}! ${result.count} in its exhibit now. Tickets: ${formatPrice(ticketPrice(useGame.getState().captured))} (+${formatPrice(def.ticket)}).`, 'good')
  }
  // Let the capture animation play before removing it.
  setTimeout(() => creatures.delete(c.uid), 900)
}

/** Called by the mini-game when it ends. */
export function finishLegendary(uid: number, success: boolean) {
  const c = creatures.get(uid)
  useSession.getState().closeModal()
  if (!c) return
  if (success) {
    completeCapture(c)
  } else {
    const def = CREATURE_BY_ID[c.creatureId]
    playUi('miss')
    useSession.getState().toast(`The ${def.name} broke free and vanished into the wild. It will return to its lair.`, 'bad')
    c.mode = 'flee'
    c.modeUntil = now() + 4
    c.calmUntil = 0
  }
}

export function startFlee(c: CreatureRuntime, seconds: number) {
  c.mode = 'flee'
  c.modeUntil = now() + seconds
  c.calmUntil = 0
  c.baitId = null
}

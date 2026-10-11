import { useEffect, useRef, useState } from 'react'
import { useGame, useSession } from '../game/state/store'
import { formatMoney, formatPrice, incomePerMinute, ticketPrice, visitorsPerMinute } from '../game/systems/economy'
import { NETS } from '../game/data/shop'
import { BIOME_BY_ID } from '../game/data/biomes'
import { CREATURE_BY_ID, RARITY_COLOR } from '../game/data/creatures'
import { baits, creatures, player } from '../game/systems/world'

function Money() {
  const money = useGame((s) => s.money)
  const captured = useGame((s) => s.captured)
  const rate = incomePerMinute(captured)
  return (
    <div className="hud-money">
      <div className="money">{formatMoney(money)}</div>
      <div className="rate">
        {rate > 0
          ? `Tickets ${formatPrice(ticketPrice(captured))} × ${visitorsPerMinute(captured)} visitors/min = +${formatMoney(rate)}/min`
          : 'Zoo closed: capture a creature to open it to visitors'}
      </div>
    </div>
  )
}

function Toasts() {
  const toasts = useSession((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

function Prompt() {
  const prompt = useSession((s) => s.prompt)
  if (!prompt) return null
  return (
    <div className="prompt">
      <kbd>E</kbd> {prompt}
    </div>
  )
}

function NetCooldown() {
  const readyAt = useSession((s) => s.netReadyAt)
  const [, force] = useState(0)
  useEffect(() => {
    if (performance.now() >= readyAt) return
    const id = setInterval(() => force((n) => n + 1), 50)
    const done = setTimeout(() => clearInterval(id), readyAt - performance.now() + 60)
    return () => {
      clearInterval(id)
      clearTimeout(done)
    }
  }, [readyAt])
  const remaining = Math.max(0, readyAt - performance.now())
  return <div className="cooldown" style={{ transform: `scaleX(${Math.min(1, remaining / 1200)})` }} />
}

function Equipment() {
  const netTier = useGame((s) => s.netTier)
  const premium = useGame((s) => s.premiumBait)
  const basic = useSession((s) => s.basicBait)
  return (
    <div className="equipment">
      <div className="slot">
        <kbd>LMB</kbd> {NETS[netTier].name}
        <NetCooldown />
      </div>
      <div className="slot">
        <kbd>Q</kbd> Bait: {premium > 0 ? <b>{premium} premium</b> : null}
        {premium > 0 ? ' · ' : ''}
        {basic} basic
      </div>
      <div className="slot hint">
        <kbd>E</kbd> Return sign · <kbd>Tab</kbd> Journal · <kbd>Shift</kbd> Sprint
      </div>
    </div>
  )
}

function SoundLog() {
  const log = useSession((s) => s.soundLog)
  return (
    <div className="soundlog">
      {log.map((l) => (
        <div key={l.id}>🔊 {l.text}</div>
      ))}
    </div>
  )
}

/** Heading-up radar of nearby creatures; needs the Tracker. */
function Radar() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const RANGE = 60
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d')!
      const R = c.width / 2
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.fillStyle = 'rgba(10, 30, 20, 0.6)'
      ctx.beginPath()
      ctx.arc(R, R, R - 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(140, 255, 180, 0.35)'
      ctx.lineWidth = 1
      for (const r of [0.33, 0.66, 1]) {
        ctx.beginPath()
        ctx.arc(R, R, (R - 4) * r, 0, Math.PI * 2)
        ctx.stroke()
      }
      const sweep = (performance.now() / 1000) % (Math.PI * 2)
      ctx.strokeStyle = 'rgba(140, 255, 180, 0.5)'
      ctx.beginPath()
      ctx.moveTo(R, R)
      ctx.lineTo(R + Math.cos(sweep) * R, R + Math.sin(sweep) * R)
      ctx.stroke()
      const cos = Math.cos(player.yaw)
      const sin = Math.sin(player.yaw)
      const plot = (x: number, z: number) => {
        const dx = x - player.position.x
        const dz = z - player.position.z
        // Rotate into player space: forward is up.
        const rx = dx * cos - dz * sin
        const rz = dx * sin + dz * cos
        return [R + (rx / RANGE) * (R - 4), R + (rz / RANGE) * (R - 4), Math.hypot(dx, dz)] as const
      }
      for (const b of baits.values()) {
        const [x, y, d] = plot(b.position.x, b.position.z)
        if (d > RANGE) continue
        ctx.fillStyle = b.premium ? '#ffd36b' : '#e6c79a'
        ctx.fillRect(x - 2, y - 2, 4, 4)
      }
      for (const cr of creatures.values()) {
        if (cr.mode === 'captured') continue
        const [x, y, d] = plot(cr.position.x, cr.position.z)
        if (d > RANGE) continue
        const def = CREATURE_BY_ID[cr.creatureId]
        ctx.fillStyle = RARITY_COLOR[def.rarity]
        ctx.beginPath()
        ctx.arc(x, y, def.rarity === 'legendary' ? 5 : 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(R, R - 6)
      ctx.lineTo(R - 4, R + 4)
      ctx.lineTo(R + 4, R + 4)
      ctx.fill()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="radar">
      <canvas ref={canvas} width={170} height={170} />
      <div className="radar-label">Tracker · 60 m</div>
    </div>
  )
}

export function Hud() {
  const location = useSession((s) => s.location)
  const locked = useSession((s) => s.locked)
  const modal = useSession((s) => s.modal)
  const tracker = useGame((s) => s.owned.tracker)
  const inBiome = location.kind === 'biome'
  return (
    <div className="hud">
      <Money />
      <div className="location">{inBiome ? BIOME_BY_ID[location.biome].name : 'Your Zoo'}</div>
      <Toasts />
      {locked && !modal && <div className="crosshair" />}
      {locked && !modal && <Prompt />}
      {inBiome && <Equipment />}
      {inBiome && <SoundLog />}
      {inBiome && tracker && <Radar />}
    </div>
  )
}

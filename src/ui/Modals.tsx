import type { ReactNode } from 'react'
import { requestLock } from '../App'
import { playUi, unlockAudio } from '../game/systems/audio'
import { useGame, useSession } from '../game/state/store'
import { BIOMES } from '../game/data/biomes'
import { SHOP_ITEMS, SHOP_ITEM_BY_ID, NETS } from '../game/data/shop'
import { formatMoney } from '../game/systems/economy'
import { Journal } from './Journal'
import { CaptureMiniGame } from '../components/CaptureMiniGame'

function Panel({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="overlay">
      <div className={`panel ${wide ? 'wide' : ''}`}>
        <div className="panel-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

const resume = () => {
  unlockAudio()
  useSession.getState().closeModal()
  useSession.setState({ started: true })
  requestLock()
}

function Controls() {
  return (
    <ul className="controls">
      <li>
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> move · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump
      </li>
      <li>
        <kbd>Mouse</kbd> look · <kbd>E</kbd> interact · <kbd>Tab</kbd> journal · <kbd>Esc</kbd> pause
      </li>
      <li>
        On expedition: <kbd>Q</kbd> drop bait · <kbd>Left click</kbd> throw net
      </li>
    </ul>
  )
}

function Pause() {
  const location = useSession((s) => s.location)
  const goTo = useSession((s) => s.goTo)
  const sens = useGame((s) => s.mouseSensitivity)
  const setSens = useGame((s) => s.setSensitivity)
  const resetSave = useGame((s) => s.resetSave)
  const firstVisit = useSession((s) => !s.started)
  return (
    <Panel title={firstVisit ? 'Zoo Explorer' : 'Paused'}>
      {firstVisit && (
        <p className="lead">
          Your zoo is empty. Head down the hill to the ferry wharf and set out on an expedition, track down creatures, lure them with bait and net them. Every species you bring
          home opens an exhibit that earns money, even while you're away.
        </p>
      )}
      <Controls />
      <div className="row">
        <button className="primary" onClick={resume}>
          {firstVisit ? 'Start exploring' : 'Resume'}
        </button>
        {location.kind === 'biome' && (
          <button
            onClick={() => {
              goTo({ kind: 'hub' })
              requestLock()
            }}
          >
            Return to zoo
          </button>
        )}
      </div>
      <label className="setting">
        Mouse sensitivity
        <input type="range" min={0.3} max={2.5} step={0.05} value={sens} onChange={(e) => setSens(Number(e.target.value))} />
        <span>{sens.toFixed(2)}×</span>
      </label>
      <button
        className="danger small"
        onClick={() => {
          if (confirm('Delete your save and start over?')) {
            resetSave()
            goTo({ kind: 'hub' })
          }
        }}
      >
        Reset save
      </button>
    </Panel>
  )
}

function Gate() {
  const owned = useGame((s) => s.owned)
  const captured = useGame((s) => s.captured)
  const goTo = useSession((s) => s.goTo)
  return (
    <Panel title="Expedition ferry" onClose={resume} wide>
      <div className="cards">
        {BIOMES.map((b) => {
          const locked = !!b.requires && !owned[b.requires]
          const species = b.spawns.map((s) => s.creatureId).concat(b.legendary.creatureId)
          const got = species.filter((id) => captured[id]).length
          return (
            <div key={b.id} className={`card biome ${locked ? 'locked' : ''}`} style={{ ['--biome' as string]: b.ground[0] }}>
              <h3>{b.name}</h3>
              <p>{b.blurb}</p>
              <p className="muted">
                Species captured: {got}/{species.length}
              </p>
              {locked ? (
                <div className="req">🔒 Requires {SHOP_ITEM_BY_ID[b.requires!].name}</div>
              ) : (
                <button
                  className="primary"
                  onClick={() => {
                    goTo({ kind: 'biome', biome: b.id })
                    requestLock()
                  }}
                >
                  Set out
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Shop() {
  // Whole-store subscription: availability depends on money, net tier and owned gear.
  const { money, netTier, premiumBait: premium, canBuy, buy } = useGame()
  const toast = useSession((s) => s.toast)
  return (
    <Panel title="Outfitter" onClose={resume} wide>
      <p className="lead">
        Balance: <b>{formatMoney(money)}</b> · Current net: <b>{NETS[netTier].name}</b> · Premium bait: <b>{premium}</b>
      </p>
      <div className="cards">
        {SHOP_ITEMS.map((item) => {
          const check = canBuy(item.id)
          const ownedAlready = check.reason === 'Owned'
          return (
            <div key={item.id} className={`card ${ownedAlready ? 'owned' : ''}`}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div className="buy">
                <span className="price">{formatMoney(item.price)}</span>
                {ownedAlready ? (
                  <span className="tag">Owned</span>
                ) : (
                  <button
                    className="primary"
                    disabled={!check.ok}
                    title={check.reason}
                    onClick={() => {
                      if (buy(item.id)) {
                        playUi('buy')
                        toast(`Bought ${item.name}`, 'good')
                      }
                    }}
                  >
                    {check.ok ? 'Buy' : check.reason}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function Modals() {
  const modal = useSession((s) => s.modal)
  const locked = useSession((s) => s.locked)
  if (modal === 'pause') return <Pause />
  if (modal === 'gate') return <Gate />
  if (modal === 'shop') return <Shop />
  if (modal === 'journal')
    return (
      <Panel title="Field journal" onClose={resume} wide>
        <Journal />
      </Panel>
    )
  if (modal && typeof modal === 'object') return <CaptureMiniGame uid={modal.uid} creatureId={modal.creatureId} />
  if (!locked)
    return (
      <div className="click-to-play" onClick={resume}>
        Click to continue
      </div>
    )
  return null
}

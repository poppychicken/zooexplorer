import { useGame } from '../game/state/store'
import { CREATURES, RARITY_COLOR } from '../game/data/creatures'
import { BIOMES } from '../game/data/biomes'
import { NETS } from '../game/data/shop'
import { captureChance } from '../game/systems/capture'
import { useAssetIndex } from '../game/systems/assets'

export function Journal() {
  const captured = useGame((s) => s.captured)
  const discovered = useGame((s) => s.discovered)
  const netTier = useGame((s) => s.netTier)
  const index = useAssetIndex()
  const total = CREATURES.length
  const gotCount = CREATURES.filter((c) => captured[c.id]).length
  return (
    <div className="journal">
      <p className="lead">
        {gotCount}/{total} species in your zoo · {Object.keys(discovered).length}/{total} discovered
      </p>
      {BIOMES.map((b) => (
        <section key={b.id}>
          <h3>{b.name}</h3>
          <div className="entries">
            {CREATURES.filter((c) => c.biome === b.id).map((c) => {
              const seen = !!discovered[c.id]
              const count = captured[c.id] ?? 0
              const chance = captureChance(c.rarity, netTier, false)
              return (
                <div key={c.id} className={`entry ${seen ? '' : 'unknown'}`}>
                  <div className="icon" style={{ background: seen ? c.placeholder.body : '#333' }}>
                    {seen && index.icons.has(c.id) ? <img src={`${import.meta.env.BASE_URL}${c.icon}`} alt="" /> : seen ? c.name[0] : '?'}
                  </div>
                  <div className="info">
                    <div className="name">
                      {seen ? c.name : '???'}{' '}
                      <span className="rarity" style={{ color: RARITY_COLOR[c.rarity] }}>
                        {c.rarity}
                      </span>
                    </div>
                    <div className="desc">{seen ? c.description : 'Not yet discovered.'}</div>
                    <div className="stats">
                      {count > 0 ? <span className="tag good">In zoo{count > 1 ? ` ×${count}` : ''}</span> : <span className="tag">Not captured</span>}
                      <span>Ticket +${c.ticket.toFixed(2)} each{c.flies ? ' · needs an aviary' : ''}</span>
                      {c.rarity === 'legendary' ? (
                        <span>Capture mini-game (green zone {Math.round(NETS[netTier].greenZone * 100)}%)</span>
                      ) : (
                        <span>
                          Net chance {Math.round(chance * 100)}% · baited {Math.round(captureChance(c.rarity, netTier, true) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

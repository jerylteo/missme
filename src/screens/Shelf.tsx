import { useState } from 'react'
import { BackBar, RarityTag, Wordmark } from '../components/ui.tsx'
import type { Message } from '../lib/content.ts'
import './shelf.css'

export interface ShelfItem {
  message: Message
  categoryLabel: string
  day: string
  favourite: boolean
}

export function Shelf({
  items,
  total,
  sealed,
  onBack,
  onOpen,
}: {
  /** Opened messages that still exist, newest first. */
  items: ShelfItem[]
  total: number
  sealed: number
  onBack: () => void
  onOpen: (id: string) => void
}) {
  const [onlyFavs, setOnlyFavs] = useState(false)
  const favCount = items.filter((i) => i.favourite).length
  const shown = onlyFavs ? items.filter((i) => i.favourite) : items
  const pct = total > 0 ? Math.round((items.length / total) * 100) : 0

  return (
    <main className="screen shelf">
      <BackBar onBack={onBack} right={<Wordmark />} />

      <div className="shelf-head">
        <h1 className="h1 h1--shelf">My shelf</h1>
        <p className="shelf-count">
          {items.length} of {total} boxes opened
        </p>
        <div className="progress" role="img" aria-label={`${items.length} of ${total} opened`}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="filters">
        <button type="button" className="filter" aria-pressed={!onlyFavs} onClick={() => setOnlyFavs(false)}>
          All
        </button>
        <button type="button" className="filter" aria-pressed={onlyFavs} onClick={() => setOnlyFavs(true)}>
          Favourites · {favCount}
        </button>
      </div>

      {shown.length === 0 && (onlyFavs || sealed === 0) ? (
        <p className="shelf-empty">
          {onlyFavs ? 'No favourites yet. Tap the heart on a message to keep it here.' : 'Nothing here yet. Bubby is still writing.'}
        </p>
      ) : (
        <ul className="shelf-grid">
          {shown.map(({ message, categoryLabel, day, favourite }) => (
            <li key={message.id}>
              <button type="button" className="shelf-card" onClick={() => onOpen(message.id)}>
                <span className="shelf-card-top">
                  <RarityTag rarity={message.rarity} small />
                  {favourite && <span className="shelf-fav">Fav</span>}
                </span>
                <span className="shelf-text">{message.text}</span>
                <span className="shelf-meta">
                  {categoryLabel} · {day}
                </span>
              </button>
            </li>
          ))}
          {!onlyFavs && sealed > 0 && (
            <li>
              <div className="shelf-sealed">
                <div className="shelf-sealed-q" aria-hidden="true">
                  ?
                </div>
                <div className="shelf-sealed-n">{sealed} still sealed</div>
              </div>
            </li>
          )}
        </ul>
      )}
    </main>
  )
}

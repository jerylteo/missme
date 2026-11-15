import tofuPeek from '../assets/tofu-peek.png'
import { RarityTag } from '../components/ui.tsx'
import type { Message } from '../lib/content.ts'
import './reveal.css'

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z" />
    </svg>
  )
}

export function Reveal({
  topBar,
  message,
  categoryLabel,
  number,
  favourite,
  onToggleFavourite,
  primaryLabel,
  onPrimary,
  footer,
  animate = true,
}: {
  topBar: React.ReactNode
  message: Message
  categoryLabel: string
  number: number
  favourite: boolean
  onToggleFavourite: () => void
  primaryLabel: string
  onPrimary: () => void
  footer?: string
  /** Slide-up entrance. Off when opened from the shelf (spec 9.5). */
  animate?: boolean
}) {
  return (
    <main className={animate ? 'screen reveal screen-enter' : 'screen reveal'}>
      {topBar}

      <div className="reveal-body">
        <div className="peek reveal-peek">
          <img src={tofuPeek} alt="Tofu the Birman kitten peeking over the message card" width={220} height={220} />
        </div>

        <article className="msg-card">
          <div className="msg-band" aria-hidden="true" />
          <div className="msg-row">
            <div className="msg-tags">
              <RarityTag rarity={message.rarity} />
              <span className="tag">{categoryLabel}</span>
            </div>
            <div className="msg-no">No. {number}</div>
          </div>
          <p className="msg-text">{message.text}</p>
          <div className="msg-row">
            <div className="msg-sign">love, Bubby</div>
            <button
              type="button"
              className={favourite ? 'heart is-on' : 'heart'}
              aria-pressed={favourite}
              aria-label="Favourite this message"
              onClick={onToggleFavourite}
            >
              <HeartIcon filled={favourite} />
            </button>
          </div>
        </article>
      </div>

      <div className="bottom">
        <button type="button" className="btn-primary" onClick={onPrimary}>
          {primaryLabel}
        </button>
        {footer && <div className="meta meta--center">{footer}</div>}
      </div>
    </main>
  )
}

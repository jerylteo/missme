import type { ReactNode, Ref } from 'react'
import tofuPeek from '../assets/tofu-peek.png'
import { type Rarity, RARITY_LABEL } from '../lib/content.ts'

export function Wordmark() {
  return <div className="wordmark">BUBBY BOX</div>
}

export function GearIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z" />
    </svg>
  )
}

/** Wordmark left; shelf link (and the admin gear) right. */
export function TopBar({ openedCount, onShelf, onAdmin }: { openedCount: number; onShelf: () => void; onAdmin?: () => void }) {
  return (
    <header className="topbar">
      <Wordmark />
      <div className="topbar-right">
        {onAdmin && (
          <button type="button" className="icon-btn" aria-label="Admin" onClick={onAdmin}>
            <GearIcon />
          </button>
        )}
        <button type="button" className="link" onClick={onShelf}>
          My shelf · {openedCount}
        </button>
      </div>
    </header>
  )
}

export function BackBar({ label = 'Back', onBack, right }: { label?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="link" onClick={onBack}>
          {label}
        </button>
      ) : (
        <span />
      )}
      {right}
    </header>
  )
}

export function RarityTag({ rarity, small }: { rarity: Rarity; small?: boolean }) {
  const cls = ['tag', small ? 'tag--sm' : '', rarity === 'common' ? '' : `tag--${rarity}`].filter(Boolean).join(' ')
  return <span className={cls}>{RARITY_LABEL[rarity]}</span>
}

export function BlindBox({ size = 'md', badge = true, lidRef, flashRef }: { size?: 'md' | 'lg'; badge?: boolean; lidRef?: Ref<HTMLSpanElement>; flashRef?: Ref<HTMLSpanElement> }) {
  return (
    <span className={`box box--${size}`} aria-hidden="true">
      <span className="box-body">
        <span className="box-ribbon" />
        {flashRef && <span className="box-flash" ref={flashRef} />}
      </span>
      {badge && <span className="box-badge">?</span>}
      <span className="box-lid" ref={lidRef}>
        <span className="box-ribbon" />
      </span>
    </span>
  )
}

/** Tofu peeking out of the box, sitting on the shelf strip (home and cooldown). */
export function Hero({ badge }: { badge: boolean }) {
  return (
    <div className="hero">
      <div className="hero-strip" aria-hidden="true" />
      <div className="hero-stack">
        <div className="peek">
          <img src={tofuPeek} alt="Tofu the Birman kitten peeking out of a blind box" width={240} height={240} />
        </div>
        <BlindBox badge={badge} />
      </div>
    </div>
  )
}

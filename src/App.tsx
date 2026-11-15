import { useEffect, useMemo, useState } from 'react'
import tofuPoint from './assets/tofu-point.png'
import { BackBar, Hero, TopBar, Wordmark } from './components/ui.tsx'
import { boxesLeft, numberWord } from './lib/copy.ts'
import { type Content, type Message, SURPRISE } from './lib/content.ts'
import { draw, pickNickname, pool } from './lib/draw.ts'
import { dayLabel, formatCountdown, type Gate, gate, shortCountdown, spokenCountdown } from './lib/limits.ts'
import { recordOpen, toggleFavourite } from './lib/storage.ts'
import { Admin } from './screens/Admin.tsx'
import { Lock } from './screens/Lock.tsx'
import { Opening } from './screens/Opening.tsx'
import { Reveal } from './screens/Reveal.tsx'
import { Shelf, type ShelfItem } from './screens/Shelf.tsx'
import { useApp } from './state/useApp.ts'

type View =
  | { k: 'home' }
  | { k: 'opening'; categoryId: string }
  | { k: 'reveal'; id: string; fromShelf: boolean }
  | { k: 'shelf' }
  | { k: 'admin' }

export default function App() {
  const app = useApp()

  if (app.status === 'boot') {
    return (
      <main className="screen" aria-busy="true">
        <header className="topbar">
          <Wordmark />
        </header>
      </main>
    )
  }

  if (app.status === 'error') {
    return (
      <main className="screen">
        <header className="topbar">
          <Wordmark />
        </header>
        <div className="head">
          <h1 className="h1 h1--state">Oh no.</h1>
          <p role="alert">Tofu can't reach the shelf. Check your connection and try again.</p>
        </div>
        <img className="center-img" src={tofuPoint} alt="Tofu the Birman kitten pointing" width={230} height={230} />
        <div className="bottom">
          <button type="button" className="btn-primary" onClick={app.retry}>
            Retry
          </button>
        </div>
      </main>
    )
  }

  if (app.status === 'lock' || !app.content) {
    return <Lock checking={app.checking} wrongCount={app.wrongCount} onSubmit={app.submitPin} />
  }

  return <Unlocked app={app} content={app.content} />
}

function Unlocked({ app, content }: { app: ReturnType<typeof useApp>; content: Content }) {
  const { local, setLocal } = app
  const [view, setView] = useState<View>({ k: 'home' })
  const [picked, setPicked] = useState(SURPRISE)
  const [now, setNow] = useState(() => Date.now())
  const [nickname] = useState(() => pickNickname(content.settings.nicknames))

  const go = (next: View) => {
    setNow(Date.now())
    setView(next)
    window.scrollTo(0, 0)
  }

  const byId = useMemo(() => new Map(content.messages.map((m) => [m.id, m])), [content])
  const catLabel = useMemo(() => new Map(content.categories.map((c) => [c.id, c.label])), [content])
  const openedIds = useMemo(() => new Set(local.opened.map((o) => o.id)), [local.opened])

  const remaining = content.messages.filter((m) => !openedIds.has(m.id))
  const g: Gate = gate(local.opened, local.lastOpenAt, content.settings, new Date(now))
  const left = Math.min(g.leftToday, remaining.length)
  const soldOut = remaining.length === 0
  const waiting = !soldOut && g.kind !== 'ready'

  // A revealed message that vanished from the content file falls back to the home states.
  const revealGone = view.k === 'reveal' && !(byId.has(view.id) && openedIds.has(view.id))
  const onHome = view.k === 'home' || revealGone

  // Live clock only while a countdown is on screen.
  useEffect(() => {
    if (!onHome || !waiting) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [onHome, waiting])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('is-admin', view.k === 'admin')
    return () => document.documentElement.classList.remove('is-admin')
  }, [view.k])

  const openedCount = local.opened.filter((o) => byId.has(o.id)).length
  const topBar = (
    <TopBar openedCount={openedCount} onShelf={() => go({ k: 'shelf' })} onAdmin={app.role === 'admin' ? () => go({ k: 'admin' }) : undefined} />
  )

  const allWord = numberWord(content.settings.dailyLimit)
  const dailyLine = `That's all ${allWord} for today. More tomorrow.`

  /** The draw: checked against the freshest stored state, recorded before any animation. */
  const drawNow = (categoryId: string): Message | null => {
    const state = app.sync() // another tab may have opened a box since this one rendered
    const t = new Date()
    if (gate(state.opened, state.lastOpenAt, content.settings, t).kind !== 'ready') return null
    const m = draw(pool(content, new Set(state.opened.map((o) => o.id)), categoryId), content.settings.weights)
    if (!m) return null
    setLocal(recordOpen(state, m.id, t))
    setNow(t.getTime())
    return m
  }

  // ---------- Shelf ----------
  if (view.k === 'shelf') {
    const items: ShelfItem[] = []
    for (let i = local.opened.length - 1; i >= 0; i--) {
      const o = local.opened[i]
      const message = byId.get(o.id)
      if (!message) continue
      items.push({
        message,
        categoryLabel: catLabel.get(message.categoryId) ?? '',
        day: dayLabel(o.at, new Date(now)),
        favourite: local.favourites.includes(o.id),
      })
    }
    return (
      <Shelf
        items={items}
        total={content.messages.length}
        sealed={remaining.length}
        onBack={() => go({ k: 'home' })}
        onOpen={(id) => go({ k: 'reveal', id, fromShelf: true })}
      />
    )
  }

  // ---------- Reveal ----------
  if (view.k === 'reveal') {
    const message = byId.get(view.id)
    const index = local.opened.findIndex((o) => o.id === view.id)
    if (message && index >= 0) {
      let footer: string | undefined
      if (!view.fromShelf) {
        if (soldOut) footer = 'That was the last box for now.'
        else if (g.kind === 'daily') footer = dailyLine
        else if (g.kind === 'cooldown') footer = `Next box in ${shortCountdown(g.until - now)} · ${left} left today`
        else footer = boxesLeft(left)
      }
      return (
        <Reveal
          topBar={view.fromShelf ? <BackBar onBack={() => go({ k: 'shelf' })} right={<Wordmark />} /> : topBar}
          message={message}
          categoryLabel={catLabel.get(message.categoryId) ?? ''}
          number={index + 1}
          favourite={local.favourites.includes(message.id)}
          onToggleFavourite={() => setLocal(toggleFavourite(app.sync(), message.id))}
          animate={!view.fromShelf}
          primaryLabel={view.fromShelf ? 'Back to my shelf' : 'Keep it on my shelf'}
          onPrimary={() => go({ k: 'shelf' })}
          footer={footer}
        />
      )
    }
    // The message vanished from the content file: fall through to home.
  }

  // ---------- Opening ----------
  if (view.k === 'opening') {
    const categoryId = view.categoryId
    return (
      <Opening
        categoryLabel={categoryId === SURPRISE ? 'Surprise me' : (catLabel.get(categoryId) ?? 'Surprise me')}
        onBack={() => go({ k: 'home' })}
        onFirstTap={() => {
          const m = drawNow(categoryId)
          if (!m) go({ k: 'home' })
          return m
        }}
        onDone={(m) => go({ k: 'reveal', id: m.id, fromShelf: false })}
      />
    )
  }

  // ---------- Admin (admin PIN only) ----------
  if (view.k === 'admin' && app.role === 'admin' && local.session) {
    return (
      <Admin
        live={content}
        ck={local.session.ck}
        envelope={app.envelopeRef.current}
        device={{ opened: openedCount, favourites: local.favourites.filter((f) => byId.has(f)).length }}
        applyPublished={app.applyPublished}
        onResetProgress={() => {
          app.resetProgress()
          setNow(Date.now())
        }}
        onLock={app.lock}
        onHome={() => go({ k: 'home' })}
      />
    )
  }

  // ---------- Home states, in priority order (spec 6.3) ----------
  if (soldOut) {
    return (
      <main className="screen">
        {topBar}
        <div className="head">
          <h1 className="h1 h1--state">Sold out!</h1>
          <p>You opened every box, {nickname}. Tofu is restocking and Bubby will top up soon.</p>
        </div>
        <img className="center-img" src={tofuPoint} alt="Tofu the Birman kitten pointing" width={230} height={230} />
        <div className="bottom">
          <button type="button" className="btn-primary" onClick={() => go({ k: 'shelf' })}>
            Re-read my shelf
          </button>
          <div className="meta meta--center">New boxes appear here when Bubby adds them</div>
        </div>
      </main>
    )
  }

  if (g.kind !== 'ready') {
    const ms = g.until - now
    return (
      <main className="screen">
        {topBar}
        <div className="head">
          <h1 className="h1 h1--state">Miss me already?</h1>
          <p>Tofu is still wrapping the next box, {nickname}.</p>
        </div>
        <Hero badge={false} />
        <div className="timer-card">
          <div className="label">Next box in</div>
          <div className="timer" role="timer" aria-live="off" aria-label={`Next box in ${spokenCountdown(ms)}`}>
            {formatCountdown(ms)}
          </div>
          <div className="meta">{g.kind === 'daily' ? dailyLine : boxesLeft(left)}</div>
        </div>
        <div className="bottom">
          <button type="button" className="btn-primary" disabled>
            Open a box
          </button>
          <button type="button" className="link" onClick={() => go({ k: 'shelf' })}>
            Re-read my shelf while I wait
          </button>
        </div>
      </main>
    )
  }

  const leftIn = (categoryId: string) => remaining.filter((m) => m.categoryId === categoryId).length
  const selected = picked !== SURPRISE && leftIn(picked) === 0 ? SURPRISE : picked

  return (
    <main className="screen">
      {topBar}
      <div className="head">
        <h1 className="h1 h1--home">Miss me?</h1>
        <p>Hi {nickname}. Bubby left you a few boxes.</p>
      </div>
      <Hero badge />
      <div className="mood">
        <div className="label" id="mood-label">
          What are you in the mood for?
        </div>
        <div className="chips" role="group" aria-labelledby="mood-label">
          <button type="button" className="chip" aria-pressed={selected === SURPRISE} onClick={() => setPicked(SURPRISE)}>
            Surprise me
          </button>
          {content.categories.map((c) => {
            const empty = leftIn(c.id) === 0
            return (
              <button key={c.id} type="button" className="chip" aria-pressed={selected === c.id} disabled={empty} onClick={() => setPicked(c.id)}>
                {empty ? `${c.label} · sold out` : c.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="bottom">
        <button type="button" className="btn-primary" onClick={() => go({ k: 'opening', categoryId: selected })}>
          Open a box
        </button>
        <div className="meta meta--center">{boxesLeft(left)}</div>
      </div>
    </main>
  )
}

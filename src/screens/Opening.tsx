import { useEffect, useMemo, useRef, useState } from 'react'
import tofuPeek from '../assets/tofu-peek.png'
import { BackBar, BlindBox } from '../components/ui.tsx'
import type { Message, Rarity } from '../lib/content.ts'
import { haptic } from '../lib/haptics.ts'
import './opening.css'

const TAPS = 3
const RISE = 66 // px Tofu travels: ears-only (78px showing) to full peek (144px)

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

/** A damped spring sampled into a CSS linear() easing (zeta 0.5, settles by t = 1). */
function springEasing(): string {
  const zeta = 0.5
  const omega = 12.4
  const omegaD = omega * Math.sqrt(1 - zeta * zeta)
  const pts: string[] = []
  const N = 40
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = 1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + ((zeta * omega) / omegaD) * Math.sin(omegaD * t))
    pts.push((i === N ? 1 : x).toFixed(4))
  }
  return `linear(${pts.join(', ')})`
}

const BURST: Record<Rarity, { count: number; colors: string[]; ring: string | null }> = {
  common: { count: 6, colors: ['var(--rose)', 'var(--pink-mid)'], ring: null },
  rare: { count: 12, colors: ['var(--rose)', 'var(--burst-blue)', 'var(--pink-mid)', 'var(--rare-bg)'], ring: 'var(--rare-bg)' },
  secret: { count: 18, colors: ['var(--rose)', 'var(--burst-gold)', 'var(--pink-mid)', 'var(--secret-bg)'], ring: 'var(--secret-bg)' },
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function done(a: Animation | undefined): Promise<unknown> {
  return a ? a.finished.catch(() => undefined) : Promise.resolve()
}

function helper(taps: number, reduce: boolean): string {
  if (reduce) return taps === 0 ? 'One tap and Tofu pops out.' : 'Here comes Tofu.'
  if (taps === 0) return 'Three taps and Tofu pops out.'
  if (taps === 1) return 'Two more taps and Tofu pops out.'
  if (taps === 2) return 'One more tap and Tofu pops out.'
  return 'Here comes Tofu.'
}

export function Opening({
  categoryLabel,
  onBack,
  onFirstTap,
  onDone,
}: {
  categoryLabel: string
  onBack: () => void
  /** Draws and records the message. Returns null when no box can be opened after all. */
  onFirstTap: () => Message | null
  onDone: (m: Message) => void
}) {
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [taps, setTaps] = useState(0)
  const [finale, setFinale] = useState(false)
  const [burst, setBurst] = useState<Rarity | null>(null)

  const tapsRef = useRef(0)
  const busyRef = useRef(false)
  const msgRef = useRef<Message | null>(null)
  const aliveRef = useRef(true)

  const shakeRef = useRef<HTMLSpanElement>(null)
  const lidRef = useRef<HTMLSpanElement>(null)
  const flashRef = useRef<HTMLSpanElement>(null)
  const tofuRef = useRef<HTMLImageElement>(null)
  const burstRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Fire the burst once its dots are in the DOM.
  useEffect(() => {
    const layer = burstRef.current
    if (!burst || !layer) return
    const dots = layer.querySelectorAll<HTMLElement>('.burst-dot')
    dots.forEach((dot, i) => {
      // Fan across the upper half so nothing flies down through the box.
      const spread = dots.length > 1 ? i / (dots.length - 1) : 0.5
      const angle = Math.PI * (1.08 - 1.16 * spread) + (Math.random() - 0.5) * 0.18
      const dist = 96 + Math.random() * 70
      const x = Math.cos(angle) * dist
      const y = -Math.sin(angle) * dist - 10
      dot.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(0.6)`, opacity: 0 },
        ],
        { duration: 620 + Math.random() * 160, easing: EASE_OUT, fill: 'both' },
      )
    })
    layer.querySelector<HTMLElement>('.burst-ring')?.animate(
      [
        { transform: 'scale(0.5)', opacity: 0.9 },
        { transform: 'scale(1.9)', opacity: 0 },
      ],
      { duration: 560, easing: EASE_OUT, fill: 'both' },
    )
    if (burst === 'secret') {
      flashRef.current?.animate([{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' })
    }
  }, [burst])

  const shake = (deg: number, duration: number) =>
    shakeRef.current?.animate(
      [0, -deg, deg, -deg * 0.6, deg * 0.6, 0].map((d) => ({ transform: `rotate(${d}deg)` })),
      { duration, easing: 'ease-out', composite: 'add' },
    )

  const tap = async () => {
    if (busyRef.current) return
    let m = msgRef.current
    if (!m) {
      m = onFirstTap()
      if (!m) return
      msgRef.current = m
    }

    if (reduce) {
      busyRef.current = true
      tapsRef.current = TAPS
      setTaps(TAPS)
      haptic(10)
      onDone(m)
      return
    }

    const n = ++tapsRef.current
    setTaps(n)
    if (n < TAPS) {
      haptic(10)
      shake(8, 250)
      return
    }

    busyRef.current = true
    setFinale(true)
    haptic([20, 40, 30])
    await done(shake(12, 300))
    await done(
      lidRef.current?.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
          { transform: 'translateY(-60px) rotate(25deg)', opacity: 0 },
        ],
        { duration: 350, easing: EASE_OUT, fill: 'forwards' },
      ),
    )
    if (!aliveRef.current) return
    setBurst(m.rarity)
    const frames = [{ transform: `translateY(${RISE}px)` }, { transform: 'translateY(0)' }]
    try {
      tofuRef.current?.animate(frames, { duration: 450, easing: springEasing(), fill: 'forwards' })
    } catch {
      // linear() easing unsupported: overshoot curve instead
      tofuRef.current?.animate(frames, { duration: 450, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' })
    }
    await wait(450 + 500)
    if (aliveRef.current) onDone(m)
  }

  const cfg = burst ? BURST[burst] : null
  const label = finale || (reduce && taps > 0) ? 'Opening the box' : `Tap the box, ${Math.min(taps + 1, TAPS)} of ${reduce ? 1 : TAPS}`

  return (
    <main className="screen opening">
      <BackBar onBack={taps === 0 ? onBack : undefined} right={<div className="pill">{categoryLabel}</div>} />

      <div className="stage">
        <span className="dash dash--1" aria-hidden="true" />
        <span className="dash dash--2" aria-hidden="true" />
        <span className="dash dash--3" aria-hidden="true" />
        <span className="dash dash--4" aria-hidden="true" />

        <button type="button" className="obox" aria-label={label} onClick={tap}>
          <span className="obox-tilt">
            <span className="obox-drop">
              <span className={finale ? 'obox-wobble is-still' : 'obox-wobble'}>
                <span className="obox-shake" ref={shakeRef}>
                  <span className="obox-window">
                    <img ref={tofuRef} src={tofuPeek} alt="" width={256} height={256} />
                  </span>
                  <span className="obox-box">
                    <BlindBox size="lg" lidRef={lidRef} flashRef={flashRef} />
                  </span>
                  <span className="burst" ref={burstRef} aria-hidden="true">
                    {cfg?.ring && <span className="burst-ring" style={{ borderColor: cfg.ring }} />}
                    {cfg &&
                      Array.from({ length: cfg.count }, (_, i) => (
                        <span key={i} className="burst-dot" style={{ background: cfg.colors[i % cfg.colors.length] }} />
                      ))}
                  </span>
                </span>
              </span>
            </span>
          </span>
        </button>
      </div>

      <div className="opening-foot">
        <h1 className="h1 h1--small">Tap the box!</h1>
        <div className="pips" role="img" aria-label={`${Math.min(taps, TAPS)} of ${reduce ? 1 : TAPS} taps done`}>
          {Array.from({ length: reduce ? 1 : TAPS }, (_, i) => (
            <span key={i} className={i < taps ? 'pip is-on' : 'pip'} />
          ))}
        </div>
        <p className="opening-help" aria-live="polite">
          {helper(taps, reduce)}
        </p>
      </div>
    </main>
  )
}

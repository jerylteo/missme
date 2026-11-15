import { useEffect, useRef, useState } from 'react'
import tofuWave from '../assets/tofu-wave.png'
import { Wordmark } from '../components/ui.tsx'
import './lock.css'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const
const LENGTH = 6

export function Lock({ checking, wrongCount, onSubmit }: { checking: boolean; wrongCount: number; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const [seenWrong, setSeenWrong] = useState(wrongCount)
  const [typedSinceWrong, setTypedSinceWrong] = useState(true)
  const dotsRef = useRef<HTMLDivElement>(null)
  // Source of truth for the handlers, so fast hardware typing never reads a stale value.
  const pinRef = useRef('')

  // A new wrong attempt arrived: clear the input (state adjusted during render, not in an effect).
  if (wrongCount !== seenWrong) {
    setSeenWrong(wrongCount)
    setPin('')
    setTypedSinceWrong(false)
  }
  const showWrong = wrongCount > 0 && !typedSinceWrong && !checking

  useEffect(() => {
    if (wrongCount === 0) return
    pinRef.current = ''
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    dotsRef.current?.animate(
      [0, -9, 9, -6, 6, -3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 360, easing: 'ease-out' },
    )
  }, [wrongCount])

  const press = (key: string) => {
    if (checking) return
    if (key === 'del') {
      pinRef.current = pinRef.current.slice(0, -1)
      setPin(pinRef.current)
      return
    }
    if (pinRef.current.length >= LENGTH) return
    pinRef.current += key
    setPin(pinRef.current)
    setTypedSinceWrong(true)
    if (pinRef.current.length === LENGTH) onSubmit(pinRef.current)
  }

  const pressRef = useRef(press)
  useEffect(() => {
    pressRef.current = press
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^\d$/.test(e.key)) pressRef.current(e.key)
      else if (e.key === 'Backspace') pressRef.current('del')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sub = checking ? 'Checking…' : showWrong ? "Tofu doesn't know that one." : 'Tofu needs the secret code.'

  return (
    <main className="screen lock">
      <Wordmark />
      <img className="lock-tofu" src={tofuWave} alt="Tofu the Birman kitten waving from a stack of books" width={190} height={190} />
      <div className="lock-head">
        <h1 className="h1 h1--small">Who goes there?</h1>
        <p className="lock-sub" role="status" aria-live="polite">
          {sub}
        </p>
      </div>

      <div className="lock-dots" ref={dotsRef} role="img" aria-label={`${pin.length} of ${LENGTH} digits entered`}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span key={i} className={i < pin.length ? 'lock-dot is-on' : 'lock-dot'} />
        ))}
      </div>

      <div className="lock-pad">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} aria-hidden="true" />
          ) : (
            <button
              key={i}
              type="button"
              className={k === 'del' ? 'lock-key lock-key--del' : 'lock-key'}
              aria-label={k === 'del' ? 'Delete' : k}
              disabled={checking}
              onClick={() => press(k)}
            >
              {k === 'del' ? 'Delete' : k}
            </button>
          ),
        )}
      </div>
    </main>
  )
}

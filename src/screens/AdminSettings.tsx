import { useState } from 'react'
import { BackBar } from '../components/ui.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { categoryInUse, type Drafts, newCategoryId, setCategories } from '../lib/admin.ts'
import type { Content } from '../lib/content.ts'
import { type Envelope, isPin, KDF_ITERATIONS, type Role } from '../lib/crypto.ts'
import { loadToken, saveToken } from '../lib/storage.ts'
import { wrapInWorker } from '../workers/client.ts'

const MAX_LABEL = 30

function NumberRow({
  id,
  label,
  unit,
  value,
  min,
  max,
  onCommit,
}: {
  id: string
  label: string
  unit?: string
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}) {
  const [raw, setRaw] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setRaw(String(value))
  }
  const commit = () => {
    const n = Number(raw)
    if (/^\d+$/.test(raw) && n >= min && n <= max) onCommit(n)
    else setRaw(String(value))
  }
  return (
    <div className="admin-line">
      <label htmlFor={id}>{label}</label>
      <span className="admin-num-wrap">
        <input
          id={id}
          className="admin-num"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {unit && <span aria-hidden="true">{unit}</span>}
      </span>
    </div>
  )
}

function CategoryRow({
  label,
  inUse,
  taken,
  onRename,
  onDelete,
}: {
  label: string
  inUse: boolean
  taken: (label: string) => boolean
  onRename: (label: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label)
  const v = value.trim()
  const ok = v.length > 0 && (v.toLowerCase() === label.toLowerCase() || !taken(v))
  if (editing) {
    return (
      <form
        className="admin-line admin-line--edit"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ok) return
          if (v !== label) onRename(v)
          setEditing(false)
        }}
      >
        <input
          className="admin-input admin-input--inline"
          aria-label={`New name for ${label}`}
          value={value}
          maxLength={MAX_LABEL}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="link" disabled={!ok}>
          Save
        </button>
      </form>
    )
  }
  return (
    <div className="admin-line">
      <span>{label}</span>
      <span className="admin-line-actions">
        {!inUse && (
          <button type="button" className="link" aria-label={`Delete ${label}`} onClick={onDelete}>
            Delete
          </button>
        )}
        <button
          type="button"
          className="link"
          aria-label={`Rename ${label}`}
          onClick={() => {
            setValue(label)
            setEditing(true)
          }}
        >
          Rename
        </button>
      </span>
    </div>
  )
}

function PinSheet({
  role,
  onClose,
  onDone,
  wrap,
}: {
  role: Role | null
  onClose: () => void
  onDone: () => void
  wrap: (role: Role, pin: string) => Promise<'ok' | 'same' | 'error'>
}) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = () => {
    if (busy) return
    setPin('')
    setAgain('')
    setError('')
    onClose()
  }
  const submit = async () => {
    if (!role) return
    if (!isPin(pin)) return setError('Use exactly 6 digits.')
    if (pin !== again) return setError("Those two don't match.")
    setBusy(true)
    setError('')
    const r = await wrap(role, pin)
    setBusy(false)
    if (r === 'same') return setError(role === 'viewer' ? 'That is your PIN. Pick a different one for her.' : 'That is her PIN. Pick a different one.')
    if (r === 'error') return setError('Something went wrong. Try again.')
    setPin('')
    setAgain('')
    onDone()
  }
  const whose = role === 'viewer' ? 'her' : 'your'
  const digits = (s: string) => s.replace(/\D/g, '').slice(0, 6)
  return (
    <Sheet open={!!role} onClose={close} locked={busy} labelledBy="pin-title">
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 className="sheet-title" id="pin-title">
          Change {whose} PIN
        </h2>
        <p>
          {role === 'viewer'
            ? 'Her phone stays unlocked. She needs the new PIN only on a new device.'
            : 'This phone stays unlocked. You need the new PIN on any other device.'}{' '}
          It takes effect when you publish.
        </p>
        <label className="label" htmlFor="pin-new">
          New PIN
        </label>
        <input id="pin-new" className="admin-input" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
        <label className="label" htmlFor="pin-again">
          Type it again
        </label>
        <input id="pin-again" className="admin-input" type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
        <p className="admin-notice admin-notice--error" role="alert">
          {error}
        </p>
        <div className="sheet-actions">
          <button type="submit" className="btn-primary admin-btn" disabled={busy}>
            {busy ? 'Working…' : 'Save new PIN'}
          </button>
          <button type="button" className="btn-outline admin-btn" disabled={busy} onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  )
}

export function AdminSettings({
  drafts,
  ck,
  envelope,
  device,
  edit,
  setSlot,
  onResetProgress,
  onLock,
  onBack,
}: {
  drafts: Drafts
  ck: string
  envelope: Envelope | null
  device: { opened: number; favourites: number }
  edit: (fn: (c: Content) => Content) => void
  setSlot: (role: Role, slot: NonNullable<Drafts['slots']['viewer']>) => void
  onResetProgress: () => void
  onLock: () => void
  onBack: () => void
}) {
  const [token, setToken] = useState(loadToken)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [pinFor, setPinFor] = useState<Role | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const content = drafts.draft
  const s = content.settings
  const taken = (label: string) => content.categories.some((c) => c.label.toLowerCase() === label.toLowerCase())
  const nl = newLabel.trim()

  const wrap = async (role: Role, pin: string): Promise<'ok' | 'same' | 'error'> => {
    const otherRole: Role = role === 'viewer' ? 'admin' : 'viewer'
    const other = drafts.slots[otherRole] ?? envelope?.slots[otherRole]
    if (!other) return 'error'
    try {
      const r = await wrapInWorker(ck, pin, KDF_ITERATIONS, other)
      if ('error' in r) return 'same'
      setSlot(role, r.slot)
      return 'ok'
    } catch {
      return 'error'
    }
  }

  return (
    <main className="screen admin admin-settings">
      <BackBar label="Back to messages" onBack={onBack} />
      <h1 className="h1 h1--admin">Settings</h1>

      <div className="admin-panel admin-panel--roomy">
        <label htmlFor="gh-token" className="label">
          GitHub token
        </label>
        <input
          id="gh-token"
          className="admin-input"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={token}
          onChange={(e) => {
            const t = e.target.value.trim()
            setToken(t)
            saveToken(t)
          }}
        />
        <div className="admin-hint">Kept on this device only. Needed to publish. Locking this device removes it.</div>
      </div>

      <div className="admin-panel">
        <div className="label">Categories</div>
        {content.categories.map((c) => (
          <CategoryRow
            key={c.id}
            label={c.label}
            inUse={categoryInUse(content, c.id)}
            taken={taken}
            onRename={(label) => edit((x) => setCategories(x, x.categories.map((y) => (y.id === c.id ? { ...y, label } : y))))}
            onDelete={() => edit((x) => (categoryInUse(x, c.id) ? x : setCategories(x, x.categories.filter((y) => y.id !== c.id))))}
          />
        ))}
        {adding ? (
          <form
            className="admin-line admin-line--edit"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nl || taken(nl)) return
              edit((x) => setCategories(x, [...x.categories, { id: newCategoryId(nl, new Set(x.categories.map((y) => y.id))), label: nl }]))
              setNewLabel('')
              setAdding(false)
            }}
          >
            <input
              className="admin-input admin-input--inline"
              aria-label="New category name"
              value={newLabel}
              maxLength={MAX_LABEL}
              autoFocus
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button type="submit" className="link" disabled={!nl || taken(nl)}>
              Add
            </button>
          </form>
        ) : (
          <button type="button" className="admin-dashed" onClick={() => setAdding(true)}>
            Add category
          </button>
        )}
      </div>

      <div className="admin-panel">
        <div className="label">Limits</div>
        <NumberRow
          id="cooldown"
          label="Wait between boxes"
          unit="min"
          value={s.cooldownMinutes}
          min={0}
          max={1440}
          onCommit={(n) => edit((x) => ({ ...x, settings: { ...x.settings, cooldownMinutes: n } }))}
        />
        <NumberRow
          id="daily"
          label="Boxes per day"
          value={s.dailyLimit}
          min={1}
          max={20}
          onCommit={(n) => edit((x) => ({ ...x, settings: { ...x.settings, dailyLimit: n } }))}
        />
      </div>

      <div className="admin-panel">
        <div className="label">This device</div>
        <div className="admin-line">
          <span>
            {device.opened} opened, {device.favourites} {device.favourites === 1 ? 'favourite' : 'favourites'}
          </span>
        </div>
        <button
          type="button"
          className="admin-dashed"
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true)
              setResetDone(false)
              return
            }
            onResetProgress()
            setConfirmReset(false)
            setResetDone(true)
          }}
        >
          {confirmReset ? 'Tap again to reset' : resetDone ? 'Progress reset' : 'Reset my progress on this device'}
        </button>
        <button type="button" className="admin-dashed" onClick={onLock}>
          Lock this device
        </button>
      </div>

      <div className="admin-pins">
        {(drafts.slots.viewer || drafts.slots.admin) && (
          <p className="admin-hint" role="status">
            {drafts.slots.viewer && drafts.slots.admin ? 'Both new PINs take' : drafts.slots.viewer ? 'Her new PIN takes' : 'Your new PIN takes'} effect when you publish.
          </p>
        )}
        <div className="admin-pins-row">
          <button type="button" className="admin-pin-btn" onClick={() => setPinFor('viewer')}>
            Change her PIN
          </button>
          <button type="button" className="admin-pin-btn" onClick={() => setPinFor('admin')}>
            Change my PIN
          </button>
        </div>
      </div>

      <PinSheet role={pinFor} onClose={() => setPinFor(null)} onDone={() => setPinFor(null)} wrap={wrap} />
    </main>
  )
}

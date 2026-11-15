import { useState } from 'react'
import { BackBar } from '../components/ui.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { MAX_TEXT, newMessage, upsertMessage } from '../lib/admin.ts'
import { type Content, type Message, type Rarity, RARITIES, RARITY_LABEL } from '../lib/content.ts'

export function AdminEdit({
  content,
  message,
  initialCategory,
  published,
  onSave,
  onDelete,
  onCancel,
}: {
  content: Content
  /** null for a new message. */
  message: Message | null
  initialCategory?: string
  /** Whether this message is already live (changes the delete wording). */
  published: boolean
  onSave: (fn: (c: Content) => Content) => void
  onDelete: (id: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(message?.text ?? '')
  const [categoryId, setCategoryId] = useState(message?.categoryId ?? initialCategory ?? content.categories[0]?.id ?? '')
  const [rarity, setRarity] = useState<Rarity>(message?.rarity ?? 'common')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const trimmed = text.trim()
  const canSave = trimmed.length > 0 && content.categories.some((c) => c.id === categoryId)

  const save = () => {
    if (!canSave) return
    const fields = { text: trimmed, categoryId, rarity }
    const m = message ? { ...message, ...fields } : newMessage(fields, new Date())
    onSave((c) => upsertMessage(c, m))
  }

  return (
    <main className="screen admin admin-edit">
      <BackBar
        label="Cancel"
        onBack={onCancel}
        right={
          message ? (
            <button type="button" className="link" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ) : undefined
        }
      />

      <h1 className="h1 h1--admin">{message ? 'Edit message' : 'New message'}</h1>

      <div className="admin-field">
        <label htmlFor="msg-text" className="label">
          Message
        </label>
        <textarea
          id="msg-text"
          className="admin-textarea"
          placeholder="What do you want her to read?"
          value={text}
          maxLength={MAX_TEXT}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="msg-count"
        />
        <div className="admin-count" id="msg-count">
          {text.length} / {MAX_TEXT}
        </div>
      </div>

      <div className="admin-field">
        <div className="label" id="cat-label">
          Category
        </div>
        <div className="admin-pills" role="group" aria-labelledby="cat-label">
          {content.categories.map((c) => (
            <button key={c.id} type="button" className="admin-pill" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-field">
        <div className="label" id="rarity-label">
          Rarity
        </div>
        <div className="rarity-grid" role="group" aria-labelledby="rarity-label">
          {RARITIES.map((r) => (
            <button key={r} type="button" className={`rarity-card rarity-card--${r}`} aria-pressed={rarity === r} onClick={() => setRarity(r)}>
              <span className="rarity-name">{RARITY_LABEL[r]}</span>
              <span className="rarity-weight">weight {content.settings.weights[r]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bottom">
        <button type="button" className="btn-primary admin-save" disabled={!canSave} onClick={save}>
          Save to drafts
        </button>
        <div className="admin-help">She sees it after you publish from the list.</div>
      </div>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} labelledBy="edit-del-title">
        <h2 className="sheet-title" id="edit-del-title">
          Delete this message?
        </h2>
        <p>
          {published
            ? "She won't get it. If she has already opened it, it leaves her shelf when you publish."
            : "It hasn't been published, so she never sees it."}
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn-primary admin-btn" onClick={() => message && onDelete(message.id)}>
            Delete
          </button>
          <button type="button" className="btn-outline admin-btn" autoFocus onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
        </div>
      </Sheet>
    </main>
  )
}

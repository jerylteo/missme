import { useState } from 'react'
import { BackBar, BinIcon, GearIcon, PencilIcon, RarityTag } from '../components/ui.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { changeCount, deleteMessage, messageFlags } from '../lib/admin.ts'
import type { Content, Message } from '../lib/content.ts'
import type { Envelope } from '../lib/crypto.ts'
import { GhError } from '../lib/github.ts'
import { loadToken } from '../lib/storage.ts'
import { PublishError, useAdmin } from '../state/useAdmin.ts'
import { AdminEdit } from './AdminEdit.tsx'
import { AdminSettings } from './AdminSettings.tsx'
import './admin.css'

type Sub = { k: 'list' } | { k: 'edit'; id: string | null } | { k: 'settings' }

const ALL = '*'

export interface AdminProps {
  live: Content
  ck: string
  envelope: Envelope | null
  device: { opened: number; favourites: number }
  applyPublished: (env: Envelope, content: Content) => void
  onResetProgress: () => void
  onLock: () => void
  onHome: () => void
}

export function Admin(props: AdminProps) {
  const admin = useAdmin({ live: props.live, ck: props.ck, applyPublished: props.applyPublished })
  const [sub, setSub] = useState<Sub>({ k: 'list' })
  const [filter, setFilter] = useState(ALL)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string; toSettings?: boolean } | null>(null)

  const go = (next: Sub) => {
    setSub(next)
    window.scrollTo(0, 0)
  }

  const d = admin.drafts
  if (!d) return <main className="screen admin" aria-busy="true" />

  if (sub.k === 'edit') {
    return (
      <AdminEdit
        content={d.draft}
        message={sub.id ? (d.draft.messages.find((m) => m.id === sub.id) ?? null) : null}
        initialCategory={filter === ALL ? undefined : filter}
        published={sub.id ? d.base.messages.some((m) => m.id === sub.id) : false}
        onSave={(fn) => {
          admin.edit(fn)
          setNotice(null)
          go({ k: 'list' })
        }}
        onDelete={(id) => {
          admin.edit((c) => deleteMessage(c, id))
          setNotice(null)
          go({ k: 'list' })
        }}
        onCancel={() => go({ k: 'list' })}
      />
    )
  }

  if (sub.k === 'settings') {
    return (
      <AdminSettings
        drafts={d}
        ck={props.ck}
        envelope={props.envelope}
        device={props.device}
        edit={admin.edit}
        setSlot={admin.setSlot}
        onResetProgress={props.onResetProgress}
        onLock={props.onLock}
        onBack={() => go({ k: 'list' })}
      />
    )
  }

  const pending = changeCount(d)
  const flags = messageFlags(d)
  const cats = d.draft.categories
  const catLabel = new Map(cats.map((c) => [c.id, c.label]))
  const activeFilter = filter === ALL || catLabel.has(filter) ? filter : ALL
  // Newest first.
  const all = [...d.draft.messages].reverse()
  const rows = activeFilter === ALL ? all : all.filter((m) => m.categoryId === activeFilter)

  const publish = async () => {
    const token = loadToken()
    if (!token) {
      setNotice({ kind: 'error', text: 'Add your GitHub token in Settings first.', toSettings: true })
      return
    }
    setPublishing(true)
    setNotice(null)
    try {
      await admin.publish(token)
      setNotice({ kind: 'ok', text: 'Published. Live in about a minute.' })
    } catch (e) {
      const text = e instanceof GhError || e instanceof PublishError ? e.message : 'Something went wrong. Nothing was published.'
      const toSettings = e instanceof GhError && (e.kind === 'token' || e.kind === 'missing')
      setNotice({ kind: 'error', text, toSettings })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <main className="screen admin">
      <BackBar
        label="Back to home"
        onBack={props.onHome}
        right={
          <button type="button" className="icon-btn icon-btn--ground" aria-label="Settings" onClick={() => go({ k: 'settings' })}>
            <GearIcon />
          </button>
        }
      />

      <div className="admin-head">
        <h1 className="h1 h1--admin">Messages</h1>
        <p className="admin-sub">
          {d.base.messages.length} live · {pending === 0 ? 'everything published' : `${pending} ${pending === 1 ? 'change' : 'changes'} not published yet`}
        </p>
        {pending > 0 && (
          <button type="button" className="link admin-discard" onClick={() => setConfirmDiscard(true)}>
            Discard changes
          </button>
        )}
      </div>

      <div className="admin-pills" role="group" aria-label="Filter by category">
        <button type="button" className="admin-pill" aria-pressed={activeFilter === ALL} onClick={() => setFilter(ALL)}>
          All · {d.draft.messages.length}
        </button>
        {cats.map((c) => (
          <button key={c.id} type="button" className="admin-pill" aria-pressed={activeFilter === c.id} onClick={() => setFilter(c.id)}>
            {c.label} · {d.draft.messages.filter((m) => m.categoryId === c.id).length}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="admin-empty">No messages here yet.</p>
      ) : (
        <ul className="admin-list">
          {rows.map((m) => {
            const flag = flags.get(m.id)
            return (
              <li key={m.id} className="admin-row">
                <div className="admin-row-main">
                  <div className="admin-row-tags">
                    <RarityTag rarity={m.rarity} small />
                    <span className="admin-cat">{catLabel.get(m.categoryId) ?? ''}</span>
                    {flag && <span className="admin-flag">{flag === 'new' ? 'New' : 'Edited'}</span>}
                  </div>
                  <div className="admin-preview">{m.text}</div>
                </div>
                <button type="button" className="admin-icon" aria-label="Edit message" onClick={() => go({ k: 'edit', id: m.id })}>
                  <PencilIcon />
                </button>
                <button type="button" className="admin-icon" aria-label="Delete message" onClick={() => setConfirmDelete(m)}>
                  <BinIcon />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="admin-bar">
        {notice && (
          <p className={notice.kind === 'ok' ? 'admin-notice' : 'admin-notice admin-notice--error'} role={notice.kind === 'ok' ? 'status' : 'alert'}>
            {notice.text}
            {notice.toSettings && (
              <>
                {' '}
                <button type="button" className="link link--inline" onClick={() => go({ k: 'settings' })}>
                  Open Settings
                </button>
              </>
            )}
          </p>
        )}
        <div className="admin-bar-row">
          <button type="button" className="btn-outline admin-btn" onClick={() => go({ k: 'edit', id: null })}>
            New message
          </button>
          <button type="button" className="btn-primary admin-btn" disabled={pending === 0 || publishing} onClick={publish}>
            {publishing ? 'Publishing…' : pending === 0 ? 'Publish' : `Publish ${pending} ${pending === 1 ? 'change' : 'changes'}`}
          </button>
        </div>
      </div>

      <Sheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} labelledBy="del-title">
        <h2 className="sheet-title" id="del-title">
          Delete this message?
        </h2>
        <p>
          {confirmDelete && d.base.messages.some((m) => m.id === confirmDelete.id)
            ? "She won't get it. If she has already opened it, it leaves her shelf when you publish."
            : "It hasn't been published, so she never sees it."}
        </p>
        <div className="sheet-actions">
          <button
            type="button"
            className="btn-primary admin-btn"
            onClick={() => {
              if (confirmDelete) admin.edit((c) => deleteMessage(c, confirmDelete.id))
              setConfirmDelete(null)
              setNotice(null)
            }}
          >
            Delete
          </button>
          <button type="button" className="btn-outline admin-btn" autoFocus onClick={() => setConfirmDelete(null)}>
            Keep it
          </button>
        </div>
      </Sheet>

      <Sheet open={confirmDiscard} onClose={() => setConfirmDiscard(false)} labelledBy="discard-title">
        <h2 className="sheet-title" id="discard-title">
          Discard {pending} {pending === 1 ? 'change' : 'changes'}?
        </h2>
        <p>Everything goes back to what she can see now, including any PIN change.</p>
        <div className="sheet-actions">
          <button
            type="button"
            className="btn-primary admin-btn"
            onClick={() => {
              admin.discard()
              setConfirmDiscard(false)
              setNotice(null)
            }}
          >
            Discard
          </button>
          <button type="button" className="btn-outline admin-btn" autoFocus onClick={() => setConfirmDiscard(false)}>
            Keep them
          </button>
        </div>
      </Sheet>
    </main>
  )
}

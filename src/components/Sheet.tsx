import { type ReactNode, useEffect, useRef } from 'react'

/**
 * In-app confirmation sheet (spec 11.1: no window.confirm). A modal <dialog> gives focus trapping and Esc.
 * `locked` keeps it open while work is in flight. Mark the safe button with `data-autofocus`:
 * showModal() would otherwise focus the first button, which is usually the destructive one.
 */
export function Sheet({
  open,
  onClose,
  locked = false,
  labelledBy,
  children,
}: {
  open: boolean
  onClose: () => void
  locked?: boolean
  labelledBy: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        if (locked) e.preventDefault() // Esc while busy
      }}
      onClose={() => {
        // Closed natively although it must stay open (a second Esc can get past onCancel): reopen.
        if (locked && open) ref.current?.showModal()
        else onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // tap on the backdrop
      }}
    >
      {open && <div className="sheet-body">{children}</div>}
    </dialog>
  )
}

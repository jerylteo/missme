import { type ReactNode, useEffect, useRef } from 'react'

/** In-app confirmation sheet (spec 11.1: no window.confirm). A modal <dialog> gives focus trapping and Esc. */
export function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // tap on the backdrop
      }}
    >
      {open && <div className="sheet-body">{children}</div>}
    </dialog>
  )
}

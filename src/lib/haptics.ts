// Best effort only. Android: Vibration API. iOS has none, so toggle a hidden
// <input type="checkbox" switch> through its label, which gives a system tick on
// recent iOS versions. Never throws, never blocks.

let label: HTMLLabelElement | null = null

function switchLabel(): HTMLLabelElement {
  if (label) return label
  const l = document.createElement('label')
  l.setAttribute('aria-hidden', 'true')
  l.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  l.appendChild(input)
  document.body.appendChild(l)
  label = l
  return l
}

export function haptic(pattern: number | number[]): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
      return
    }
    switchLabel().click()
  } catch {
    // optional
  }
}

// A cached index.html can outlive a deploy and point at script files that no
// longer exist, which leaves a blank page. If one fails to load, fetch a fresh
// page once. main.tsx clears the flag after a good start.
addEventListener(
  'error',
  function (e) {
    var t = e.target
    if (!t || !(t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && /stylesheet|modulepreload/.test(t.rel)))) return
    // Only the app's own build files: a blocked third-party tag must not trigger a reload.
    var base = new URL('assets/', document.baseURI).href
    if (String(t.src || t.href || '').indexOf(base) !== 0) return
    try {
      if (sessionStorage.getItem('missme:recovered')) return
      sessionStorage.setItem('missme:recovered', '1')
    } catch {
      return
    }
    location.replace(location.pathname + '?r=' + Date.now())
  },
  true,
)

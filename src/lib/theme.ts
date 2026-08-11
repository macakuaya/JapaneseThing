// Theme application.
//
// The palette itself lives in app.css and switches on `color-scheme`, so the
// system theme needs no JavaScript. This module exists for the two things CSS
// cannot do: pin an explicit override on <html>, and keep the browser's own
// chrome — the address bar on Android, the PWA status bar — the same colour as
// the page it sits above.

import type { ThemeMode } from './types.ts'

/** Kept in step with --bg in app.css. */
const PAGE = { light: '#f7f6f3', dark: '#191918' } as const

const system = (): 'light' | 'dark' =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

/** What is actually on screen for a given setting. */
export const resolveTheme = (mode: ThemeMode): 'light' | 'dark' =>
  mode === 'system' ? system() : mode

function paintBrowserChrome(mode: ThemeMode): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', PAGE[resolveTheme(mode)])
}

/**
 * The setting currently in force, remembered so the media-query listener below
 * knows whether a system change is any of its business.
 */
let current: ThemeMode = 'system'
let listening = false

export function applyTheme(mode: ThemeMode): void {
  current = mode

  // Absent for 'system': no attribute means `color-scheme: light dark`, which
  // is what lets the OS decide. Setting it to a literal "system" would match
  // neither override rule but would still be a lie in the DOM.
  if (mode === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = mode

  paintBrowserChrome(mode)

  // On 'system' the CSS follows the OS by itself, but the chrome colour above
  // is a snapshot — it has to be repainted when the OS flips at sunset.
  if (!listening && typeof matchMedia === 'function') {
    listening = true
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (current === 'system') paintBrowserChrome('system')
    })
  }
}

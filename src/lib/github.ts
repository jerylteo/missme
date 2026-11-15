// Minimal GitHub Contents API client for publishing the envelope (spec 11.4).
// The token is passed in per call and only ever sent to api.github.com.

export const GH = {
  owner: import.meta.env?.VITE_GH_OWNER || 'jerylteo',
  repo: import.meta.env?.VITE_GH_REPO || 'missme',
  branch: import.meta.env?.VITE_GH_BRANCH || 'main',
  path: 'public/data/content.enc.json',
}

export type GhErrorKind = 'token' | 'missing' | 'conflict' | 'network' | 'other'

export class GhError extends Error {
  kind: GhErrorKind
  constructor(kind: GhErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

const API = 'https://api.github.com'

function url(): string {
  return `${API}/repos/${encodeURIComponent(GH.owner)}/${encodeURIComponent(GH.repo)}/contents/${GH.path}`
}

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function call(input: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  let res: Response
  try {
    res = await fetcher(input, { ...init, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
  } catch {
    throw new GhError('network', "Can't reach GitHub. Check your connection.")
  }
  if (res.ok) return res
  if (res.status === 401 || res.status === 403) throw new GhError('token', 'Token rejected. Check it in Settings.')
  // A fine-grained token without access to the repo also gets a 404.
  if (res.status === 404) throw new GhError('missing', "Token can't see the repo. Check it in Settings.")
  if (res.status === 409 || res.status === 422) throw new GhError('conflict', 'The live file changed while publishing.')
  throw new GhError('other', `GitHub said ${res.status}. Try again in a minute.`)
}

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export async function getFile(token: string, fetcher: typeof fetch = fetch): Promise<{ sha: string; text: string }> {
  const res = await call(`${url()}?ref=${encodeURIComponent(GH.branch)}`, { headers: headers(token) }, fetcher)
  const body = (await res.json()) as { sha?: unknown; content?: unknown; encoding?: unknown }
  if (typeof body.sha !== 'string' || typeof body.content !== 'string' || body.encoding !== 'base64') {
    throw new GhError('other', 'GitHub sent something unexpected. Try again in a minute.')
  }
  return { sha: body.sha, text: b64ToUtf8(body.content) }
}

export async function putFile(token: string, text: string, sha: string, message: string, fetcher: typeof fetch = fetch): Promise<void> {
  await call(
    url(),
    {
      method: 'PUT',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: utf8ToB64(text), sha, branch: GH.branch }),
    },
    fetcher,
  )
}

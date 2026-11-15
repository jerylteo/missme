// content.local.json -> public/data/content.enc.json
// Run with: npm run seal
//   npm run unseal            the other way round: the sealed file -> content.local.json,
//                             to bring edits published from the phone back to the laptop
//   npm run seal -- --drop    allow removing messages that are in the sealed file
//   npm run seal -- --new-key allow a new key when the PINs do not open the sealed file
// PINs are asked for with hidden input. For automated test seals only, they can
// come from MISSME_VIEWER_PIN / MISSME_ADMIN_PIN instead.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateContent } from '../src/lib/content.ts'
import { decryptContent, isEnvelope, isPin, seal, unwrapCk } from '../src/lib/crypto.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(root, 'content.local.json')
const OUT = resolve(root, 'public/data/content.enc.json')

function fail(msg) {
  console.error(`\n${msg}`)
  process.exit(1)
}

function askHidden(label) {
  return new Promise((done, reject) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) return reject(new Error('No terminal for PIN entry. Run this in a real terminal.'))
    stdout.write(label)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          return done(value)
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false)
          stdout.write('\n')
          process.exit(130)
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value) {
            value = value.slice(0, -1)
            stdout.write('\b \b')
          }
        } else if (ch >= ' ') {
          value += ch
          stdout.write('*')
        }
      }
    }
    stdin.on('data', onData)
  })
}

async function getPin(envName, label) {
  const pin = process.env[envName] ?? (await askHidden(label))
  if (!isPin(pin)) fail(`${label.trim()} must be exactly 6 digits.`)
  return pin
}

const flags = new Set(process.argv.slice(2))
const BACKUP = resolve(root, 'content.backup.local')

if (flags.has('--pull')) {
  if (!existsSync(OUT)) fail(`Missing ${OUT}. Run git pull first.`)
  let env
  try {
    env = JSON.parse(readFileSync(OUT, 'utf8'))
  } catch {
    env = null
  }
  if (!isEnvelope(env)) fail('public/data/content.enc.json is not a sealed file.')
  const pin = await getPin('MISSME_ADMIN_PIN', 'Your PIN (admin, 6 digits):  ')
  const key = (await unwrapCk(env.slots.admin, pin, env.kdf.iterations)) ?? (await unwrapCk(env.slots.viewer, pin, env.kdf.iterations))
  if (!key) fail('That PIN does not open the sealed file. Is it up to date (git pull)?')
  const pulled = await decryptContent(env, key)
  const bad = validateContent(pulled)
  if (bad.length) fail(`The sealed content has problems:\n- ${bad.join('\n- ')}`)
  if (existsSync(SRC)) copyFileSync(SRC, BACKUP)
  writeFileSync(SRC, JSON.stringify(pulled, null, 2) + '\n')
  console.log(
    `Wrote ${pulled.messages.length} messages and ${pulled.categories.length} categories to content.local.json` +
      (existsSync(BACKUP) ? ' (previous copy saved as content.backup.local).' : '.'),
  )
  process.exit(0)
}

if (!existsSync(SRC)) fail(`Missing ${SRC}. Copy content.example.json to content.local.json and edit it.`)

let content
try {
  content = JSON.parse(readFileSync(SRC, 'utf8'))
} catch (e) {
  fail(`content.local.json is not valid JSON: ${e.message}`)
}
const problems = validateContent(content)
if (problems.length) fail(`content.local.json has problems:\n- ${problems.join('\n- ')}`)

const viewer = await getPin('MISSME_VIEWER_PIN', "Her PIN (viewer, 6 digits): ")
const admin = await getPin('MISSME_ADMIN_PIN', 'Your PIN (admin, 6 digits):  ')
if (viewer === admin) fail('The two PINs must differ.')

// Keep the existing content key when both PINs still open the current file, so
// devices that are already unlocked stay unlocked.
let ck
let old = null
if (existsSync(OUT)) {
  try {
    const parsed = JSON.parse(readFileSync(OUT, 'utf8'))
    if (isEnvelope(parsed)) {
      old = parsed
      const a = await unwrapCk(old.slots.viewer, viewer, old.kdf.iterations)
      const b = await unwrapCk(old.slots.admin, admin, old.kdf.iterations)
      if (a && b && Buffer.from(a).equals(Buffer.from(b))) ck = a
    }
  } catch {
    // unreadable old file: fall through to a new key
  }
}

// The phone can publish too, so the sealed file may hold things this laptop has never seen.
if (old && !ck && !flags.has('--new-key')) {
  fail(
    'These PINs do not open the current sealed file. If a PIN was changed in the app, run git pull and use the new PIN.\n' +
      'To replace the key on purpose (every device must unlock again, phone drafts are lost): npm run seal -- --new-key',
  )
}
if (old && ck && !flags.has('--drop')) {
  let live = null
  try {
    live = await decryptContent(old, ck)
  } catch {
    // damaged old file: nothing to compare
  }
  const mine = new Set(content.messages.map((m) => m.id))
  const missing = (live?.messages ?? []).filter((m) => !mine.has(m.id)).length
  if (missing) {
    fail(
      `The sealed file has ${missing} ${missing === 1 ? 'message' : 'messages'} that content.local.json does not ` +
        '(published from the phone?).\nRun git pull, then npm run unseal to bring them over.\n' +
        'To remove them on purpose: npm run seal -- --drop',
    )
  }
}

const envelope = await seal(content, { viewer, admin }, { ck })

// Self-check before writing: the file must open with the key and hide the text.
const check = await decryptContent(envelope, (await unwrapCk(envelope.slots.viewer, viewer, envelope.kdf.iterations)))
if (JSON.stringify(check) !== JSON.stringify(content)) fail('Self-check failed: decrypted content differs.')
const file = JSON.stringify(envelope)
for (const m of content.messages) {
  const probe = m.text.slice(0, 12)
  if (probe.length >= 6 && file.includes(probe)) fail('Self-check failed: message text is readable in the output.')
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, file + '\n')
console.log(
  `Sealed ${content.messages.length} messages into public/data/content.enc.json ` +
    (ck ? '(same key: unlocked devices stay unlocked).' : '(new key: every device must enter its PIN again).'),
)

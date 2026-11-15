// Writes a test envelope (content.example.json, PINs 111111 / 222222) into dist/ only,
// so e2e/shots.mjs can run after a real seal. Never point this at public/.
// Usage: npm run build && npm run test:e2e-seal
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seal } from '../src/lib/crypto.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist/data/content.enc.json')
if (!existsSync(dirname(out))) {
  console.error('No dist/data. Run npm run build first.')
  process.exit(1)
}
const content = JSON.parse(readFileSync(resolve(root, 'content.example.json'), 'utf8'))
writeFileSync(out, JSON.stringify(await seal(content, { viewer: '111111', admin: '222222' })) + '\n')
console.log('Test envelope written to dist/data/content.enc.json (PINs 111111 / 222222).')

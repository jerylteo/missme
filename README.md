# Bubby Box

A small private web app: enter a PIN, pick a mood, tap a blind box, and Tofu reveals a saved message. Hosted at https://www.jerylteo.com/missme/.

## Commands

- `npm run dev` starts the local dev server.
- `npm test` runs the unit tests.
- `npm run build` type-checks and builds to `dist/`.
- `npm run seal` encrypts `content.local.json` into `public/data/content.enc.json`.

## Topping up messages from the phone

1. Unlock with the admin PIN and tap the gear.
2. In Settings, paste a fine-grained GitHub token limited to this repo with Contents read and write. It stays on that device; locking the device removes it.
3. Add, edit or delete messages, then tap Publish. GitHub Actions rebuilds the site in about a minute.

## Topping up messages from the laptop

1. Edit `content.local.json` (it is not committed).
2. Run `npm run seal` and enter the viewer PIN, then the admin PIN.
3. Commit `public/data/content.enc.json` and push to `main`.

Publish from the phone after a laptop seal only if both PINs stayed the same; a new key makes the phone ask to unlock again.

## Regenerating icons

The icons in `public/icons/` are made from `src/assets/tofu-wave.png`. After replacing that image, run `npm run make-icons` (needs Playwright's Chromium: `npx playwright install chromium`).

## Adding to the home screen

Add the site to the home screen before first use (Safari, Share, Add to Home Screen). An installed web app on iOS keeps its own storage, separate from Safari's.

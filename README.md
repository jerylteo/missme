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

The phone publishes straight to GitHub, so start from what is live:

1. `git pull`, then `npm run unseal` (admin PIN). This rewrites `content.local.json` from the sealed file; the previous copy is kept as `content.backup.local`.
2. Edit `content.local.json` (it is not committed).
3. Run `npm run seal` and enter the viewer PIN, then the admin PIN.
4. Commit `public/data/content.enc.json` and push to `main`.

`npm run seal` stops if the sealed file has messages your local file lacks (`-- --drop` removes them on purpose) or if the PINs do not open it (`-- --new-key` replaces the key on purpose: every device must unlock again and unpublished phone drafts are lost).

## Regenerating icons

The icons in `public/icons/` are made from `src/assets/tofu-wave.png`. After replacing that image, run `npm run make-icons` (needs Playwright's Chromium: `npx playwright install chromium`).

## Adding to the home screen

Add the site to the home screen before first use (Safari, Share, Add to Home Screen). An installed web app on iOS keeps its own storage, separate from Safari's.

# Bubby Box

A small private web app that gives Cindy a message from Jeryl whenever she misses him, hosted at https://www.jerylteo.com/missme/.

## Commands

- `npm run dev` starts the local dev server.
- `npm test` runs the tests.
- `npm run build` type-checks and builds to `dist/`.
- `npm run seal` encrypts `content.local.json` into `public/data/content.enc.json`.

## Topping up messages

1. Edit `content.local.json` (it is not committed).
2. Run `npm run seal`.
3. Enter the viewer PIN, then the admin PIN, when asked.
4. Commit `public/data/content.enc.json`.
5. Push to `main`. GitHub Actions tests, builds and deploys the site.

## Regenerating icons

The icons in `public/icons/` are made from `src/assets/tofu-wave.png`. After replacing that image, run:

    node scripts/make-icons.mjs

This needs Playwright's Chromium (`npx playwright install chromium`).

## Note for Cindy

Add the site to the home screen before first use (Safari, Share, Add to Home Screen). It is meant to be opened from the home screen icon, not from a browser tab.

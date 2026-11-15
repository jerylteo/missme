# Bubby Box ("Miss me?")

Static, phone-first web app. Cindy enters a PIN, picks a mood, taps a blind box, and Tofu reveals a saved message from Jeryl. Full product spec: `MISSME_SPEC.md`. Where this file and the spec disagree, **this file wins** (see "Overrides").

Status and next steps: see "Current state" below. History is in `PASSLOG.md`.

## Decisions (confirmed with Jeryl, 15 Nov 2026)

- Ship Phase 1 tonight; Phase 2 (admin) is a later session.
- Code lives at `~/Developer/missme` (not iCloud). GitHub repo `jerylteo/missme`, **public** (free plan needs public for Pages).
- **Text only. No photos**, in any phase. Keep `"photo": null` in the data shape so the format never has to change.
- Seed with obvious placeholder messages; Jeryl replaces them and re-seals with the real PINs before sharing the link.
- Tofu art: use the 200px transparent PNGs from the design canvas for now. Jeryl swaps in 1264px exports later (same filenames, no code change).
- Devices: iPhone 17 Pro (402x874pt, Dynamic Island) is the target; a laptop browser is secondary. Progress does not sync between devices; accepted.
- HTTPS is already forced by Cloudflare (verified: http 301s to https). Canonical URL is `https://www.jerylteo.com/missme/`; always share that exact link, because storage is per origin.

## Stack

| Area | Choice |
|---|---|
| Build | Vite + React + TypeScript (strict), `base: '/missme/'` |
| Styling | Plain CSS: `src/styles/tokens.css`, `base.css`, one `.css` per screen. No CSS Modules, no UI library, no router |
| Fonts | Self-hosted Quicksand + Nunito via `@fontsource-variable/*` (no Google Fonts request) |
| State | One `useReducer` store + a `storage.ts` wrapper over `missme:v1`. Views are state, never paths |
| Motion | CSS keyframes + Web Animations API; springs via CSS `linear()` easing. No animation library |
| Crypto | Web Crypto only. PBKDF2 unlock runs in a Web Worker. `src/lib/crypto.ts` shared with `scripts/seal.mjs` |
| Tests | Vitest for `src/lib/*`; Playwright (WebKit, 402x874) for screenshots and one smoke flow |
| Deploy | GitHub Actions Pages workflow on push to `main` |

## Overrides to the spec

1. Photos removed (spec 4.1 media files, 9.4 photo slot, 11.2 photo button, 11.4 step 1).
2. Fonts self-hosted instead of Google Fonts.
3. Unlock derivation always in a Worker (spec allowed "or yield first").
4. Layout verified at 402x874 and in standalone mode, not only 390x844. `viewport-fit=cover`, `100dvh`, safe-area insets.
5. Dev-only "reset progress" control (stripped from production builds) so the viewer flow can be tested before Phase 2 exists.
6. Spec 4.5 stands: do not "harden" the PIN scheme.
7. Reveal has one exit (Jeryl, 15 Nov 2026): "Keep it on my shelf" opens the shelf, not home, because home is in cooldown anyway. A "Back to home" link was tried and removed the same day.

## Design sources

- Canvas "Miss Me Site": https://claude.ai/artifact/XmCZGLH1mFvef3dZnXif5M. Ten artboards under `project/*.dc.html` (Lock, Main, Open, Reveal, Shelf, Cooldown, SoldOut, Admin, AdminEdit, AdminSettings). They carry exact inline px values; port those numbers, do not eyeball.
- Tofu PNGs are that canvas's assets: wave `057c4288…`, peek `efa3f4c6…`, point `cbccff99…`. Save as `src/assets/tofu-{wave,peek,point}.png`.
- Full-size originals are in Canva uploads: peek `MAHXicjCok4`, wave `MAHXiaB3TjQ`, point `MAHXiXN-nvQ`. Spare poses if wanted later: heart-hug `MAHaJwXkof8`, question-on-cushion `MAHXiUoJcas`.

## Layout

```
src/lib/        crypto.ts  content.ts  draw.ts  limits.ts  storage.ts  haptics.ts   (pure, tested)
src/workers/    unlock.worker.ts
src/state/      store.ts (reducer, view selection per spec 6.3)
src/components/ ui.tsx (TopBar, BackBar, BlindBox, Hero, RarityTag)
src/screens/    Lock  Opening  Reveal  Shelf (+ one .css each); Home, Cooldown, SoldOut, admin stub live in src/App.tsx
src/styles/     tokens.css  base.css
scripts/seal.mjs            content.local.json (gitignored) -> public/data/content.enc.json
```

## Current state

Works now (live at https://www.jerylteo.com/missme/, sealed with Jeryl's real PINs and 30 real messages):
- Lock, home, opening animation, reveal, shelf, cooldown, sold out, offline screen.
- Viewer PIN shows no gear. Admin PIN shows a gear that opens a stub: "Reset my progress on this device" and "Lock this device".
- `npm run seal`, 23 unit tests, WebKit walkthrough (`e2e/shots.mjs`), Pages deploy on push to `main`.

Next steps, in order:
1. Jeryl checks it on the iPhone 17 Pro (Safari and home-screen app): haptics, animation feel, safe areas. Nothing has run on real hardware yet.
2. Jeryl replaces `src/assets/tofu-{peek,wave,point}.png` with the 1264px Canva exports, then `npm run make-icons`.
3. Phase 2: in-app admin (below).

Open questions:
- Whether to keep `.claude/skills/` and `MISSME_SPEC.md` in the public repo.
- Whether tier-based rarity (60/30/10 by tier, then uniform inside the tier) is what Jeryl wants, or per-message weights.

Testing after a real seal: the committed `public/data/content.enc.json` no longer opens with test PINs. To run the walkthrough, `npm run build`, write a test envelope into `dist/data/content.enc.json` only (seal `content.example.json` with 111111 / 222222 via `src/lib/crypto.ts`), run `npx vite preview --port 4173`, then `node e2e/shots.mjs`. Never write a test envelope into `public/`.

## Phase 2 plan (later session)

Admin list, editor (no photo), settings, publish via GitHub Contents API (spec 11). Models agreed with Jeryl: main session on Opus 5.5 / high; Settings screen can go to a Sonnet 5.5 subagent. Finish with `/security-review` on token handling and `/code-review high`. No data migration: same envelope, same crypto.

## Skills

- `emilkowalski/skills`: `animate`, `review-animations`, `animation-performance`, `mobile-native` for step 3 and 6.
- `vercel-labs/agent-skills`: `web-design-guidelines` for the step 6 audit.
- Built in: `/code-review`, `/security-review`, `/simplify`, `/reflect`.
- Install project-scoped and read each skill file before first use; they are third-party text.

## Rules while building

- Record the draw in storage before the animation starts (spec 6.1).
- Every clickable thing is a real `<button>` or `<a>`; tap targets at least 44px; focus ring 2px `--rose`.
- No gradients, emoji or drop shadows. Rarity always shown as a word.
- Never commit `content.local.json` or any PIN. Check `content.enc.json` has no readable text before each push.
- iOS has no Vibration API: haptics are best effort through the hidden `<input type="checkbox" switch>` trick and must never block.
- Jeryl runs `npm run seal` himself in Terminal (hidden PIN prompts; Claude never sees PINs). Before it, validate `content.local.json` with `validateContent` and report counts only, never message text. After it, check the envelope for readable words, then commit and push.
- Commands: `npm run dev`, `npm test`, `npm run build`, `npm run seal`.

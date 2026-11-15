# Bubby Box ("Miss me?")

Static, phone-first web app. Cindy enters a PIN, picks a mood, taps a blind box, and Tofu reveals a saved message from Jeryl. Full product spec: `MISSME_SPEC.md`. Where this file and the spec disagree, **this file wins** (see "Overrides").

Status: Phase 1 built. Phase 2 (admin) not started. The admin PIN currently opens a stub with "reset progress" and "lock this device". Styling is plain per-screen CSS files (not CSS Modules). `node e2e/shots.mjs` walks every screen in WebKit against `vite preview --port 4173`.

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
| Styling | Plain CSS: `src/styles/tokens.css` + CSS Modules per component. No UI library, no router |
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
7. Reveal has two exits (Jeryl, 15 Nov 2026): primary "Keep it on my shelf" opens the shelf, and a "Back to home" link returns home. Spec 9.4 had a single button that returned home.

## Design sources

- Canvas "Miss Me Site": https://claude.ai/artifact/XmCZGLH1mFvef3dZnXif5M. Ten artboards under `project/*.dc.html` (Lock, Main, Open, Reveal, Shelf, Cooldown, SoldOut, Admin, AdminEdit, AdminSettings). They carry exact inline px values; port those numbers, do not eyeball.
- Tofu PNGs are that canvas's assets: wave `057c4288…`, peek `efa3f4c6…`, point `cbccff99…`. Save as `src/assets/tofu-{wave,peek,point}.png`.
- Full-size originals are in Canva uploads: peek `MAHXicjCok4`, wave `MAHXiaB3TjQ`, point `MAHXiXN-nvQ`. Spare poses if wanted later: heart-hug `MAHaJwXkof8`, question-on-cushion `MAHXiUoJcas`.

## Layout

```
src/lib/        crypto.ts  content.ts  draw.ts  limits.ts  storage.ts  haptics.ts   (pure, tested)
src/workers/    unlock.worker.ts
src/state/      store.ts (reducer, view selection per spec 6.3)
src/components/ TopBar  BlindBox  TofuPeek  Chip  RarityTag  PrimaryButton  Countdown
src/screens/    Lock  Home  Opening  Reveal  Shelf  Cooldown  SoldOut
src/styles/     tokens.css  base.css
scripts/seal.mjs            content.local.json (gitignored) -> public/data/content.enc.json
```

## Phase 1 plan (tonight)

Main session stays on Fable 5.2 and owns the contract, the lib and the animation. Subagents only take work that does not touch files the main session is editing. Brief each one with goal, exact paths, constraints, done-when, and a 15-line reply cap.

| Step | Work | Who | Model / effort |
|---|---|---|---|
| 0 | Create `~/Developer/missme`, scaffold, `git init`, create public repo, install skills, pull Tofu PNGs, write `tokens.css` + types | main | Fable 5.2 / medium |
| 1 | `src/lib/*` test-first: crypto round trip, wrong PIN, slot to role, draw weights over 10,000 draws, no repeats, cooldown, daily cap, midnight reset. Then `seal.mjs` | main | Fable 5.2 / high |
| 2a | Pages workflow, manifest, icons from waving Tofu, iOS meta tags, README | subagent, parallel with 1 | Sonnet 5.5 / medium |
| 2b | Shared components, then screens ported from the artboards: Lock, Home, Cooldown, SoldOut, Shelf, Reveal | main; Shelf + SoldOut may go to one subagent once components exist | Fable 5.2 / medium (subagent: Sonnet 5.5 / medium) |
| 3 | Opening animation (spec 10), haptics, reduced-motion path | main, using emilkowalski skills | Fable 5.2 / high |
| 4 | Wire store, refetch on open and `visibilitychange`, offline error screen | main | Fable 5.2 / medium |
| 5 | Verify: Vitest, Playwright screenshots of every screen at 402x874 and 360 wide, walk the spec 14 checklist | main | Fable 5.2 / high |
| 6 | Review: `/code-review high`, `review-animations`, `web-design-guidelines` audit; one fresh-context reviewer checks the build against spec 6, 9, 13 | built-in skill + subagent | Opus 5.5 / high |
| 7 | Seal placeholders with throwaway test PINs, push, confirm the live URL, hand over | main | Fable 5.2 / medium |

Jeryl's part after step 7: check it on the phone, write real messages in `content.local.json`, run `npm run seal` with the two real PINs (Claude never sees them), push. Cindy adds the site to her home screen before first use.

## Phase 2 plan (later session)

Admin list, editor (no photo), settings, publish via GitHub Contents API (spec 11). Main session on Opus 5.5 / high; Settings screen can go to a Sonnet 5.5 subagent. Finish with `/security-review` on token handling and `/code-review high`. No data migration: same envelope, same crypto.

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
- Commands: `npm run dev`, `npm test`, `npm run build`, `npm run seal`.

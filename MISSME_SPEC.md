# Bubby Box ("Miss me?") — build spec for Claude Code

A static, mobile-first web app. Cindy opens it when she misses Jeryl, picks a mood, taps a blind box, and Tofu (their cat, as an illustrated mascot) reveals a saved message from him. Jeryl tops up messages from a hidden admin view.

Design source: the "Miss Me Site" canvas (10 artboards, 390x844). Export them as PNGs and attach them to the Claude Code session; this document is the written version of the same screens.

## 1. Constraints

- Static site only. No backend, no database, no analytics.
- Hosted on GitHub Pages from its own repo `missme`, reached at `jerylteo.com/missme/` (project site under the user-site custom domain).
- Messages live in the same repo, encrypted.
- One URL, no routes. Views are React state, never paths (`/missme/admin` must not exist).
- Phone first. On wider screens, centre a 430px-max column on the pink ground.
- English only.

## 2. Phases

**Phase 1 (ship tonight):** lock screen, home, opening animation, reveal, shelf, cooldown, sold-out, plus a local `seal` script so Jeryl can seed ~10 messages without the admin UI.

**Phase 2:** in-app admin (messages list, editor, settings, publish to GitHub).

Build Phase 1 so Phase 2 needs no data migration: same file format, same crypto.

## 3. Stack

- Vite + React + TypeScript. `base: '/missme/'` in `vite.config.ts`.
- Plain CSS (one tokens file + per-component CSS). No UI library, no router.
- Animations in CSS keyframes / Web Animations API. No animation library needed.
- Web Crypto API for everything cryptographic. No crypto dependencies.
- Deploy with a GitHub Actions Pages workflow on push to `main`.
- `manifest.webmanifest`: name "Bubby Box", `display: standalone`, `start_url: /missme/`, theme and background `#FFDDE5`, icons made from the waving Tofu on pink. No service worker in v1.

## 4. Content and encryption

### 4.1 Files

```
public/data/content.enc.json     encrypted envelope (the only content file the app fetches)
public/data/media/<id>.bin       encrypted photos (12-byte IV + AES-GCM ciphertext)
content.local.json               plaintext source for Phase 1 seeding — GITIGNORED
scripts/seal.mjs                 Node script: content.local.json -> content.enc.json
```

Fetch `data/content.enc.json` with `cache: 'no-store'` so top-ups show up without a hard refresh.

### 4.2 Plaintext shape (what gets encrypted)

```json
{
  "settings": {
    "cooldownMinutes": 60,
    "dailyLimit": 3,
    "weights": { "common": 6, "rare": 3, "secret": 1 },
    "nicknames": ["frufru", "wifey", "my love"]
  },
  "categories": [
    { "id": "work", "label": "At work" },
    { "id": "thinking", "label": "Thinking of you" },
    { "id": "remember", "label": "Remember when" }
  ],
  "messages": [
    {
      "id": "uuid-v4",
      "categoryId": "work",
      "rarity": "common",
      "text": "…",
      "photo": null,
      "createdAt": "2026-11-15T12:00:00.000Z"
    }
  ]
}
```

`rarity` is `common | rare | secret`. `photo` is `null` or a media id. Message ids never change once created (her progress is keyed on them). "Surprise me" is not a stored category; it means all categories.

### 4.3 Envelope

```json
{
  "v": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000 },
  "slots": {
    "viewer": { "salt": "b64", "iv": "b64", "wrapped": "b64" },
    "admin":  { "salt": "b64", "iv": "b64", "wrapped": "b64" }
  },
  "iv": "b64",
  "data": "b64"
}
```

- A random 256-bit AES-GCM content key (CK) encrypts the plaintext JSON (`data`) and every photo.
- CK is wrapped twice: once with a key derived from Cindy's PIN (viewer slot), once with a key derived from Jeryl's PIN (admin slot). PBKDF2-SHA-256, 600,000 iterations, 16-byte random salt per slot, AES-GCM wrap.
- Both PINs are 6 digits and must differ.

### 4.4 Unlock flow

1. User enters 6 digits.
2. Derive a key against the viewer slot and try to unwrap CK. If AES-GCM authentication fails, try the admin slot.
3. Whichever slot unwraps sets the role: `viewer` or `admin`. Neither: shake the dots, clear input, copy "Tofu doesn't know that one."
4. On success, store `{ ck: <raw key b64>, role }` in localStorage so she is not asked again on that device. If a later fetch fails to decrypt with the stored CK (PINs or key rotated), drop it and show the lock screen.

Derivation takes roughly a second on a phone. Show the waving Tofu with "Checking…" and disable the keypad meanwhile. Run it off the main thread or yield first so the tap feedback paints.

### 4.5 Security notes (accepted trade-offs, do not "fix")

- Everything is client-side. A 6-digit PIN can be brute-forced offline by anyone who downloads the public file. This keeps casual visitors out; it is not strong secrecy. Jeryl has confirmed nothing sensitive goes in.
- The admin PIN only reveals the admin UI and the same messages. It grants no write access. Writing needs the GitHub token, which is never stored in the repo.
- Git history keeps old envelopes, so changing a PIN does not protect past versions.

### 4.6 `scripts/seal.mjs` (Phase 1)

`npm run seal` reads `content.local.json`, prompts for the viewer PIN and admin PIN (hidden input), and writes `public/data/content.enc.json`. If an envelope already exists and both PINs unwrap it, reuse the existing CK so photos stay valid; otherwise generate a new CK. Share the crypto module between the script and the app (`src/lib/crypto.ts`, runnable under Node's `globalThis.crypto`).

## 5. Local state (her device)

One localStorage key, `missme:v1`:

```ts
{
  session?: { ck: string; role: 'viewer' | 'admin' },
  opened: { id: string; at: string }[],   // ISO timestamps
  favourites: string[],
  lastOpenAt?: string
}
```

There is no server copy. Clearing site data or changing phone resets progress; that is accepted. Wrap all storage access in try/catch.

Tell Cindy to add the site to her home screen **before** first use: an installed web app on iOS has its own storage, separate from Safari's.

## 6. Rules

### 6.1 Drawing a message

- Pool = messages not in `opened`, filtered by the chosen category (all categories for Surprise me).
- Weighted random by rarity using `settings.weights` (default common 6, rare 3, secret 1). Use `crypto.getRandomValues`.
- Record the message as opened (and set `lastOpenAt`) at the moment of the draw, before the animation, so a refresh cannot re-roll.
- An opened message never appears in a draw again.

### 6.2 Limits

- Cooldown: next box allowed at `lastOpenAt + cooldownMinutes`.
- Daily cap: `dailyLimit` opens per local calendar day (count `opened` entries dated today). Resets at local midnight.
- Client-side only; no tamper protection needed.

### 6.3 Home states, in priority order

1. Everything opened -> **Sold out** screen.
2. Daily cap reached -> **Cooldown** screen, timer counts to midnight, sub-line "That's all three for today. More tomorrow."
3. Cooldown running -> **Cooldown** screen, `mm:ss` countdown, live.
4. Otherwise -> **Home**.

A category with nothing left stays visible as a disabled dashed chip "At work · sold out". If the selected category sells out, fall back to Surprise me.

## 7. Design tokens

| Token | Value | Use |
|---|---|---|
| `--ground` | `#FFDDE5` | page background (her side) |
| `--ground-admin` | `#FFF6F8` | page background (admin) |
| `--ink` | `#4A2B36` | all body text |
| `--ink-soft` | `#6E4A56` | meta text |
| `--rose` | `#B83E64` | primary buttons, box lid, selected chips, accents |
| `--rose-link` | `#8A3B55` | text links, wordmark, outline-button text |
| `--pink-mid` | `#F4A3B8` | ribbon, dashed borders, disabled button |
| `--pink-soft` | `#F7B9C8` | shelf strip, Delete key |
| `--card` | `#FFFFFF` | chips, cards, box body |
| `--tofu-card` | `#E7D2D4` | band that blends into the peek illustration's card |
| rarity common | bg `#FFDDE5`, text `#4A2B36` | tag |
| rarity rare | bg `#DCE9F8`, text `#254E86` | tag |
| rarity secret | bg `#FBE7A6`, text `#5C4300` | tag |

Type: **Quicksand** 600/700 for headings, buttons, the wordmark and message text; **Nunito** 400/600/700 for everything else (Google Fonts, same pair as the Tofu slide decks).

- Wordmark "BUBBY BOX": Quicksand 700, 13px, letter-spacing 2px, `--rose-link`.
- H1: Quicksand 700, 54px home / 44px states / 38px shelf / 32px admin, line-height 1–1.1.
- Body 17px/1.4; meta 14px weight 600; chip label 15px weight 700.
- Radii: chips 16, cards 20–24, primary button fully round (height 60), admin buttons height 56.
- Spacing: page padding 28px top, 24px sides and bottom; 16px gaps between blocks. Respect `env(safe-area-inset-*)`.
- Every tap target at least 44px. Visible focus ring (2px `--rose`, 2px offset).
- No gradients, no emoji, no drop shadows. Icons are inline stroke SVG (2px, round caps).

## 8. Tofu assets

Three transparent PNGs, exported from Canva at 1264x1264, in `src/assets/`:

| File | Pose | Used on |
|---|---|---|
| `tofu-peek.png` | peeking over a pink card | home, opening, reveal, cooldown |
| `tofu-wave.png` | waving on a stack of books | lock screen, app icon |
| `tofu-point.png` | standing, pointing | sold out |

**Peek-in-a-box trick.** `tofu-peek.png` includes its own card. Measured on the image (as fractions of its height): the card's top edge is at 0.515, the paws end around 0.59, the card spans x 0.105–0.89.

- Home/cooldown: show the image at 240px in a 240x144 `overflow: hidden` window (top 60%). Directly under it draw the CSS box, 206px wide, overlapping by 2px. The sliver of card visible under the paws reads as the box's inner rim.
- Opening: 256px image in a 256x78 window (ears only), box 256px wide below.
- Reveal: 220px image in a 220x132 window, `z-index` above the message card; the card starts 19px higher and has a 32px top band in `--tofu-card` so the illustration's card blends into it.

**The CSS box.** Lid: full width, 38px tall, `--rose`, radius 6/6/12/12. Body: inset 8px each side, starts 30px down, white, bottom radius 18. Ribbon: 24px wide vertical stripe, centred, `--pink-mid`, full height. Badge: 52px circle `--ground` centred on the body with a Quicksand 700 34px "?" in `--rose`. Scale all numbers by 1.25 on the opening screen.

## 9. Screens (her side)

Common top bar on home, reveal, cooldown, sold out: wordmark left; "My shelf · N" link right (N = opened count). In the admin role, add a 44px round gear button to the left of the shelf link. That gear is the only entry to admin.

### 9.1 Lock
Centred column: wordmark, waving Tofu (190px), H1 "Who goes there?" (30px), sub "Tofu needs the secret code.", six 18px dots (filled `--rose` when entered, else white with 2px `--rose` border), then a 3x4 keypad pinned to the bottom: 68px round white keys, Quicksand 700 26px digits, blank bottom-left, "Delete" bottom-right on `--pink-soft` at 14px. Auto-submit on the sixth digit. Use real `<button>`s; also accept hardware keyboard digits and Backspace.

### 9.2 Home
Top bar. H1 "Miss me?". Sub "Hi {nickname}. Bubby left you a few boxes." where the nickname is picked at random from `settings.nicknames` each visit. Hero (272px tall): peek-in-a-box centred, sitting on a 22px-tall full-width rounded strip in `--pink-soft`. Label "What are you in the mood for?". 2-column chip grid, 48px tall, 10px gap: "Surprise me" first and selected by default, then one chip per category. Selected = `--rose` with white text; unselected = white with ink text. Chips are `aria-pressed` toggle buttons, single-select. Bottom: primary button "Open a box", then "{n} boxes left today".

### 9.3 Opening the box
Top bar here is "Back" (left, only before the first tap) and the chosen category as a white pill (right). Box at 1.25 scale, tilted -5deg, Tofu's ears showing, four short motion dashes beside it. Bottom: H1 "Tap the box!", three 44x10 pips (filled `--rose` per tap), helper "Two more taps and Tofu pops out." (count updates). Sequence in section 10.

### 9.4 Reveal
Top bar. Tofu peeking over the message card. Card (white, radius 24): row with rarity tag + category tag on the left and "No. {n}" (her nth opened) on the right; message text Quicksand 600 21px/1.45, `white-space: pre-wrap`; optional photo (radius 16, max height 150, `object-fit: cover`, tap to view full); footer row "love, Bubby" and a 48px round heart button (outline = not favourite, filled `--rose` = favourite; `aria-pressed`). If the content is taller than the screen the page scrolls; never shrink the text. Bottom: primary "Keep it on my shelf" (returns home, which will now be in cooldown), then "Next box in 59 min · 2 left today".

### 9.5 My shelf
"Back" left, wordmark right. H1 "My shelf", "{opened} of {total} boxes opened", a 10px progress bar (white track, `--rose` fill). Filter pills "All" and "Favourites · n" (44px tall). 2-column grid of 148px white cards, newest first: rarity tag, "Fav" marker if favourited, first lines of the text (3-line clamp), then "{category} · {day}". Tapping a card opens the reveal card for it without animation and without the limits footer. Last cell: dashed outline card with "?" and "{n} still sealed". Only show opened messages that still exist in the content file.

### 9.6 Cooldown
Home layout with: H1 "Miss me already?", sub "Tofu is still wrapping the next box, {nickname}.", the hero box without the "?" badge, a white card with "Next box in" / live countdown in Quicksand 700 48px `--rose` / "{n} boxes left today", a disabled "Open a box" button (`--pink-mid` background, ink text), and a text link "Re-read my shelf while I wait". When the timer hits zero, switch to Home without a reload.

### 9.7 Sold out
H1 "Sold out!", sub "You opened every box, {nickname}. Tofu is restocking and Bubby will top up soon.", pointing Tofu (230px), primary "Re-read my shelf", footer "New boxes appear here when Bubby adds them". On every app open and on `visibilitychange`, refetch content so new messages end this state.

## 10. Opening animation

All timings are targets; keep it snappy.

| Step | Trigger | What happens |
|---|---|---|
| Enter | screen mounts | Box drops in from above with one bounce (400ms, ease-out-back). |
| Idle | waiting | Gentle wobble loop, +/-2deg, 1.6s. |
| Tap 1, 2 | tap on box | Shake +/-8deg for 250ms, a pip fills, short haptic (10ms). |
| Tap 3 | tap on box | Bigger shake (300ms), then the lid lifts 60px, rotates 25deg and fades (350ms). Haptic pattern 20-40-30ms. |
| Pop | after lid | Tofu rises from ears-only to full peek (image window grows 78 -> 144px on a spring, 450ms). |
| Burst | with pop | Common: 6 small pink dots fly out. Rare: 12 dots in pink and blue plus a `#DCE9F8` ring pulse. Secret: 18 dots in pink and yellow, `#FBE7A6` ring pulse, box flashes once. |
| Hand-off | 500ms after pop | Cross-fade/slide-up into the Reveal screen (300ms). |

- The whole box is one large `<button>` ("Tap the box, {k} of 3"). Space/Enter count as taps.
- `prefers-reduced-motion: reduce`: one tap, no shake or burst, simple 200ms fade to the reveal.
- Haptics: `navigator.vibrate?.()` where it exists (Android). iOS Safari has no Vibration API; as a best-effort extra, toggle a visually hidden `<input type="checkbox" switch>` through its `<label>`, which gives a system tick on recent iOS versions. Treat haptics as optional; never block on them.

## 11. Admin (Phase 2)

Reached only via the gear on Home after unlocking with the admin PIN. Ground `--ground-admin`, page padding 20px sides.

### 11.1 Messages
"Back to home" left, gear (settings) right. H1 "Messages", sub "{n} live · {k} changes not published yet". Filter pills: "All · n" then one per category with counts. List of white rows (radius 18): rarity tag, category, a "New" or "Edited" flag for unpublished rows, one-line text preview, then 44px edit (pencil) and delete (bin) icon buttons with `aria-label`s. Delete asks for confirmation in an in-app sheet (no `window.confirm`). Bottom bar: outline "New message" and primary "Publish {k} changes" (disabled when k = 0).

Jeryl cannot see what Cindy has opened; there is no server to tell him.

### 11.2 Editor
"Cancel" left, "Delete" right (existing messages only). H1 "New message" / "Edit message". Labelled textarea (150px, 2px `--pink-mid` border, radius 16, 400-character counter). Category pills, single-select. Rarity: three 64px cards in a row (Common / Rare / Secret, each showing its weight), selected one gets a 2px `--rose` border and `--ground` fill. Dashed "Add a photo (optional)" button: pick an image, downscale to max 1280px JPEG at 0.8 quality in a canvas, show a thumbnail with a remove control. Primary "Save to drafts"; helper "She sees it after you publish from the list."

### 11.3 Settings
- **GitHub token**: password field. "Kept on this device only. Needed to publish." Stored in localStorage, never in the repo or the content file.
- **Categories**: rename, add. Deleting a category is only allowed when no message uses it.
- **Limits**: cooldown minutes and boxes per day.
- **Change her PIN / Change my PIN**: re-wrap CK in that slot; takes effect on next publish.
- **Reset my progress on this device** (for testing the viewer flow).

### 11.4 Publishing
Drafts are held in memory and mirrored to localStorage (`missme:drafts`) so a reload does not lose them. Publish:

1. Encrypt and upload each new photo: `PUT /repos/{owner}/{repo}/contents/public/data/media/{id}.bin`.
2. Encrypt the full content and `PUT` `public/data/content.enc.json` with the current file `sha` (fetch it first). On a 409/422 sha conflict, refetch and retry once.
3. Show "Published. Live in about a minute." (Pages rebuild.)

Auth: fine-grained personal access token limited to the `missme` repo with Contents read/write. Owner, repo and branch come from `VITE_GH_OWNER`, `VITE_GH_REPO`, `VITE_GH_BRANCH`. Surface 401/403 as "Token rejected. Check it in Settings."

## 12. Copy rules

- She is addressed with a random nickname from settings. He is always "Bubby". The mascot is "Tofu".
- Short, warm, no exclamation overload: at most one per screen.
- Errors stay in voice: offline -> "Tofu can't reach the shelf. Check your connection and try again." with a Retry button.

## 13. Accessibility

- Real `<button>`, `<a>`, `<input>`, `<label>` elements everywhere; nothing clickable on a `div`.
- Text contrast at least 4.5:1 with the tokens as given; do not lighten them.
- Rarity is always shown as a word, never colour alone.
- Countdown: `aria-live="off"`, with an accessible label that updates once a minute.
- Decorative shapes `aria-hidden`; Tofu images have descriptive `alt`.

## 14. Done when

- [ ] `jerylteo.com/missme/` loads on iPhone Safari and as a home-screen app; no horizontal scroll at 360–430px.
- [ ] Wrong PIN rejected; viewer PIN shows no gear; admin PIN shows the gear.
- [ ] `content.enc.json` in the repo contains no readable message text.
- [ ] Opening a box never repeats a message; rarity weights respected over a simulated 10,000 draws (unit test).
- [ ] After one open, Home shows the countdown; after three in a day, it counts to midnight.
- [ ] Opened messages and favourites survive a reload.
- [ ] Sold-out state appears when the pool is empty and clears after new messages are published.
- [ ] Reduced-motion setting skips the shake and burst.
- [ ] (Phase 2) Add, edit, delete and publish from the phone; a new message appears for the viewer within about two minutes.

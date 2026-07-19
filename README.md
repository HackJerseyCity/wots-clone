# wots-clone

Tiny web front-end for the [`wots`](../wots) Node client. Log in with a phone
number, then see your reports.

## Prereqs

- Node 18+
- A checkout of the `wots` library at `../wots` (sibling directory). It's
  wired up as `"wots": "file:../wots"` in `package.json`.

## Run

```
npm install
npm start
```

Then open http://localhost:3000. Override the port with `PORT=4000 npm start`.

Login flow: enter a US phone number → WOTS texts a 4-digit code → enter it →
your reports render. The JWT is kept in `localStorage` (~90-day lifetime), so
reloading the tab skips straight to the list. "Log out" clears it.

## Layout

- `server.js` — Node `http` server, no framework. Serves the SPA and proxies
  four endpoints to the `wots` lib:
  - `POST /api/start-login` `{ phone }` → `{ session }`
  - `POST /api/complete-login` `{ session, code }` → `{ token, sub, auth, exp }`
  - `POST /api/resend-code` `{ session }` → `{ ok: true }`
  - `GET  /api/incidents` (Bearer token) → `{ items }`
- `public/index.html` — single self-contained page (HTML + CSS + JS, no
  build step, no framework).

## Error mapping

`WotsError.code` is passed through as `{ error, message }`. Client-side
validation codes (`INVALID_PHONE`, `INVALID_CODE_FORMAT`, `INVALID_JWT`)
become 400; HTTP errors from the upstream API preserve their status via
`err.status`; anything else is 500. The browser translates a handful of
codes (`CODE_NOT_VALID`, `SMS_THRESHOLD`, …) into human-readable strings.

## Notes

- The server is a stateless proxy — the browser holds `session` (in
  `sessionStorage`, mid-flow) and `token` (in `localStorage`, post-login).
- No CSRF or origin checks; assume localhost dev only. Don't deploy as-is.
- Rate limit: hitting `startLogin` repeatedly trips the WOTS server's
  `SMS_THRESHOLD`. Use the "Resend code" button, not "Send code" again.

# Sign in with Better Lyrics: integration guide

Better Lyrics exposes a generic identity primitive. Any consenting origin can ask the extension to vouch for the user's BL keyId via a signed assertion. The user's private key never leaves the extension.

## Prerequisites

- Your origin must be listed in BL's `externally_connectable.matches` and `web_accessible_resources` (the auth page). Currently allowed: `https://unison.boidu.dev/*`. To request inclusion, open a PR or issue against the Better Lyrics repo.
- You need the BL extension ID for the channel you're targeting:
  - Chrome Web Store production: published listing ID.
  - Firefox AMO: `betterlyrics@boidu.dev`.

## Protocol

### 1. Mint a server-side challenge

```http
GET https://unison.boidu.dev/auth/challenge
```

Response: `{ success: true, data: { nonce: "...", expiresAt: <unix> } }`. The nonce is single-use; reuse returns `CHALLENGE_INVALID` on `/auth/session`.

### 2. Request a signed assertion from the extension

```js
const response = await chrome.runtime.sendMessage(BL_EXTENSION_ID, {
  type: "bl-auth-request",
  nonce, // from step 1
  origin: location.origin, // must match the browser's view of your origin
});
```

`response` shape:

- Success: `{ ok: true, signedBody: { payload, signature, publicKey } }`
- Failure: `{ ok: false, reason: "ORIGIN_MISMATCH" | "INVALID_REQUEST" | "USER_CANCELLED" | "USER_DISMISSED" | "SIGN_FAILED" }`

If the user has already approved your origin within the last 24 hours, the call resolves immediately without showing any UI. Otherwise the extension opens a small consent popup.

### 3. POST the signed body to the Unison server from your own context

```js
const res = await fetch("https://unison.boidu.dev/auth/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(response.signedBody),
});
const session = await res.json();
// session.data = { sessionToken, expiresAt, keyId, displayName }
```

The browser auto-sets `Origin: https://unison.boidu.dev` on this request. The server independently verifies that `payload.origin` matches the HTTP `Origin` header, so a malicious tab cannot impersonate a different origin even with a valid signed body.

### 4. Use the session token

```http
GET https://unison.boidu.dev/auth/me
Authorization: Bearer <sessionToken>
```

Response: `{ success: true, data: { keyId, displayName, expiresAt } }`.

## UX guidelines

- Show "Sign in with Better Lyrics" only when `chrome.runtime` is available in the page context. You may briefly send a ping message to detect whether the extension is installed.
- The popup is opened by the extension; you do not control its dimensions or position. Treat it like an OAuth provider window.
- Treat `USER_CANCELLED` and `USER_DISMISSED` identically: return to the unsigned state and allow retry.
- The user's approval is remembered for 24 hours by default. Subsequent calls within that window resolve without re-opening the popup.

## Failure modes

| Reason | Meaning | What you should do |
| --- | --- | --- |
| `ORIGIN_MISMATCH` | Your stated `origin` disagreed with the browser's view of your origin | Bug in your integration. Use `location.origin` directly. |
| `INVALID_REQUEST` | Malformed `nonce` or missing fields | Bug in your integration. The nonce must be at least 16 characters. |
| `USER_CANCELLED` | User clicked Cancel | Return to unsigned state, allow retry. |
| `USER_DISMISSED` | User closed the popup window | Same as above. |
| `SIGN_FAILED` | Cryptographic failure (should not happen in practice) | Show a generic error, allow retry. |

## Security notes

- The challenge nonce is single-use. Reusing one yields `CHALLENGE_INVALID` on `/auth/session`.
- The signed payload binds `origin`, and is verified server-side against the HTTP `Origin` header.
- The user's keypair is generated lazily on first use. There is no separate account-creation step.
- The extension never exposes the user's private key to any page or any other tab.

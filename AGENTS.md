# AGENTS.md

Operating notes for AI agents working in this repo. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
code guidelines (imports, DOM safety, logging, comment style) — they are enforced in review and not
repeated here.

## Toolchain

- Node `>=22.12` (CI pins 22.x). `node_modules` is not shared between git worktrees — run
  `npm install` in each one.
- Build is [extension.js](https://extension.js.org) (`extension` CLI) over rspack. All build
  customisation lives in `extension.config.js`, not in a webpack/rspack config file.
- `manifest.json` uses extension.js browser-prefixed keys (`chrome:key`, `chromium:background`,
  `gecko:background`, `edge:key`). The prefix is resolved per `--browser` target, so a key without a
  prefix applies everywhere.
- Formatting and linting are Biome only. Prettier is explicitly disabled.

## Running the extension

`npm run dev` launches Chrome on YouTube Music with a persistent managed profile under
`dist/extension-js/profiles/`. Google rejects new sign-ins while `dev` holds the remote-debugging
transport, so to authenticate a fresh profile run `npm run start` once (no CDP transport), sign in,
quit, then use `npm run dev`. `dev:firefox` and `dev:brave` / `start:brave` target the other
browsers.

## The locale codegen step

`src/core/generated/locales.ts` is generated from the `_locales/` directory tree. Every npm script
that touches types or builds runs `generate:locales` first. If you invoke `tsc`, `tsx`, or the
`extension` CLI directly, run `npm run generate:locales` yourself or typecheck will fail on a missing
module.

## Verification gates

Run these before claiming work is done; they are what CI checks:

```bash
npm run typecheck   # tsc --noEmit
npm run selfcheck   # the test suite (see below)
npm run lint        # biome lint --write + format --write; rewrites files in place
npm run knip        # unused exports/deps/files
npm run build       # full multi-browser build
```

Also available: `npm run check:i18n-brand` (protected product terms must survive translation
verbatim), `npm run build:ci` (adds sourcemap patching + R2 upload), `npm run knip:fix`.

`tooling/check-packaged-hdr-theme.ts` asserts against `dist/` and is deliberately *not* part of
`selfcheck` — run `npm run build` first, then `npx tsx tooling/check-packaged-hdr-theme.ts`.

## Tests are self-checks

There is no test runner. `npm run selfcheck` discovers every `**/*.selfcheck.ts` under `src/` and
`tooling/` and executes each as a standalone `tsx` script; a non-zero exit fails the run. They use
`node:assert/strict`, and `jsdom` plus hand-rolled fake clocks for anything DOM- or timer-shaped.

### Do not write new self-checks by default

There are already 53 of them and they cover the invariants that actually break. Every one is a
separate `tsx` process in CI, and a test that restates its implementation costs real time on every
run while proving nothing. **Adding coverage is not part of "finishing" a change here.** Ship the
change, run the gates, and leave the suite alone.

Write a self-check only when one of these is true:

- The maintainer asked for one.
- You are fixing a bug whose cause was a non-obvious logic error, and a single assertion pins that
  exact regression.
- You are adding genuinely tricky *pure* logic — a parser, a timing/offset calculation, a state
  machine, a merge or sort — where the invariant cannot be confirmed by reading the function.

Never write one for: thin wrappers and delegation, DOM construction or event wiring, constants and
config plumbing, anything `tsc` already proves, or a case whose expected value you derived by running
the code. If a self-check is warranted, prefer extending the nearest existing `.selfcheck.ts` over
creating a new file, and prefer one assertion that states the invariant over a table of cases that
enumerate the implementation.

If you believe something needs coverage and it does not clearly fit above, say what you would assert
and why in your summary and let the maintainer call it. Do not write it speculatively.

Mechanics, when you do write one: keep it pure — a self-check needing the browser, the network, or a
build artifact does not belong in the discovered set. No `knip.json` change is needed, as
`src/**/*.selfcheck.ts` is already an entry glob (new *application* entrypoints do need adding there).

## The UI guard ratchet

`tooling/ui-guards.selfcheck.ts` regex-scans `src/` and `pages/` and enforces a `KNOWN` baseline of
per-file violation counts. It asserts in **both** directions: exceeding a count fails, and dropping
below it also fails and tells you to lower the number (deleting the entry at zero). Expect to edit
`KNOWN` when you clean a file up.

Rules, with the pattern logic in `tooling/uiGuardRules.ts`: no native `<select>` outside `src/ui/`,
no `text-transform: uppercase` in CSS, no raw `font-size` outside `src/ui/tokens.css`, no raw
white/alpha colour literals outside `src/ui/`, no dark translucent field wells. The intended fix is
always a `src/ui/` primitive or a `src/ui/tokens.css` variable, never a local workaround.

For size work there is an on-demand (not gated, no committed baseline) reporter over a built `dist/`:

```bash
npx tsx tooling/bundle-sizes.ts dist/chrome --save=sizes.json   # record
npx tsx tooling/bundle-sizes.ts dist/chrome --compare=sizes.json # diff, plus byte-identical chunks
```

## The renderer lives elsewhere

The lyrics renderer, highlight engine, and format parsers are the
[braccato](https://github.com/better-lyrics/braccato) repo, consumed here as exact-pinned
`@braccato/core`, `@braccato/highlight`, and `@braccato/parsers`. Renderer behaviour, timing, and the
lyrics CSS are **not** editable from this repo — change them upstream and bump the version.
CONTRIBUTING.md has the `npm link` loop for working against a local checkout. Dependabot bumps on
`*/braccato-*` branches auto-merge once Build and the quality workflow pass.

## Content script worlds

`manifest.json` splits injection across MAIN and ISOLATED worlds at `document_start` and
`document_end`. Which world a file runs in is a hard constraint on what it can touch, and importing
`@/index` from anywhere re-executes the ISOLATED content script in the wrong context. Message across
the boundary instead of reaching across it; `public/script.js` is the player bridge that publishes
MAIN-world snapshots.

## Versioning

Versions are 4-digit (`3.0.0.4`) in `package.json` and `manifest.json`, with a human-facing 3-digit
`version_name`. `npm run update-version -- <version>` rewrites `package.json`, `manifest.json`,
`src/options/options.html`, and `README.md` together — never edit them by hand. Releases run from the
`release` workflow via `workflow_dispatch`; canary builds require a 4-digit version and set
`RELEASE_TYPE=canary`.

## Theme and styling work

Read [STYLING-SKILL.md](STYLING-SKILL.md) first — it is the condensed, agent-facing CSS-variable
reference. [STYLING.md](STYLING.md) is the exhaustive version and is excluded from Biome, so do not
reformat it. Bundled themes live in `public/css/themes/`; `HDR.css` carries an opt-in theme-settings
directive that the packaged-theme check verifies survives the build byte for byte.

## Attribution for agent-authored PRs

Any pull request opened by an AI agent must disclose it in the PR description, naming the model and
the person it is acting for. Use this template, substituting both placeholders:

> Opened by `<model name>` working on behalf of `@<github-handle>`.

`<model name>` and `@<github-handle>` are placeholders, not literal text — fill in the model that
actually wrote the change and the GitHub handle of the person it is acting for. Filled in, the line
reads like this (the model and handle here are only an illustration):

> Opened by Claude Opus 5.5 working on behalf of @octocat.

Keep this line even when the human reviews and amends the work. That disclosure is the whole
requirement — no generated-by footers or commit trailers are expected on top of it.

The PR template carries an **Authorship** section holding this line and a human-authored
alternative. Tick the box that applies and fill the line in; do not delete the section.

Undisclosed agent-authored PRs are closed on sight, and unreviewed agent output from outside
contributors is not accepted at all — see the policy in CONTRIBUTING.md.

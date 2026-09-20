# Contributing to Better Lyrics

Thanks for your interest in contributing! This guide covers both code and translation contributions.

## Issue-First Policy

**Open an issue before submitting a PR.** Discuss proposed changes first to ensure alignment with project direction. PRs without prior discussion may be closed.

Exception: Typo fixes and small documentation updates can be submitted directly.

## Development Setup

### Prerequisites

- Node.js 18+
- npm

### Getting Started

```bash
git clone https://github.com/better-lyrics/better-lyrics.git
cd better-lyrics
npm install
npm run build
```

For loading the extension in your browser, see [Manual Installation](README.md#manual-installation) in the README.

### Development Commands

```bash
npm run dev       # Watch mode with hot reload
npm run build     # Production build
npm run lint      # Run linter & formatter
npm run typecheck # TypeScript type check
```

### Working on the renderer

The lyrics renderer and the format parsers live in their own repo,
[braccato](https://github.com/better-lyrics/braccato), and get pulled in here as the published
`@braccato/core` and `@braccato/parsers` packages.

For most renderer work you don't need this extension at all. braccato ships a demo page with Vite and
hot reload, so run `pnpm -C demo dev`, open `http://localhost:5173/`, and timing or CSS changes show
up as you type. Come back here when you need to check the parts the demo can't show you: the lyrics
tab, fullscreen, the floating window, a real song's timings.

For that, symlink your local checkout over the installed copy. Build braccato and register the link:

```bash
git clone https://github.com/better-lyrics/braccato.git
cd braccato
pnpm install
pnpm build:packages
cd packages/core && npm link   # or packages/parsers
```

Then point this repo at it:

```bash
cd better-lyrics
npm link @braccato/core
npm run dev
```

`npm run dev` opens Chrome on YouTube Music with the extension loaded. The link lives only in
`node_modules`, so `package.json` and `package-lock.json` stay clean and it can't sneak into a commit.

After each edit to the renderer, rebuild braccato so the extension has something new to pick up:

```bash
pnpm build:packages
```

That rebuild on its own won't reload anything, because the dev server ignores every path with `dist`
in it and that's where the linked package's output lands. Save any file in `src/` afterwards and the
resulting rebuild will pull in the fresh package output.

When you're done, `npm install` puts the published copy back. Avoid `npm unlink`, which removes the
dependency from `package.json` instead of just dropping the symlink.

## Code Guidelines

### Imports

- Use path aliases: `@core/*`, `@constants`, `@utils`, `@modules/*`
- Named imports only: `import { foo } from "module"` (no `import * as`)
- Never import from `@/index` (causes content script execution in wrong context)

### DOM & Security

- Never use `innerHTML` - use `createElement`, `textContent`, `replaceChildren`
- No empty catch blocks - always log errors with context

### Error Logging

- Content scripts: Use `log()` from `@utils` with constants from `@constants`
- Options/extension pages: Use `console.error()` with log prefix constants

### Style

- No inline comments unless essential
- Section dividers format: `// -- Section Name --------------------------`

## Pull Request Process

1. Open an issue first (unless trivial fix)
2. Fork and create a feature branch
3. Follow code guidelines above
4. Ensure typecheck, lint & builds pass ( `npm run typecheck` `npm run lint` `npm run build`)

### Review Expectations

- PRs are reviewed for code quality, security, and alignment with project patterns
- Be prepared for feedback and iteration
- Large changes may require multiple rounds of review

## Translation Guide

Better Lyrics uses [Crowdin](https://crowdin.com/project/better-lyrics) for translation management.

### How to Contribute Translations

1. Visit the [Better Lyrics Crowdin project](https://crowdin.com/project/better-lyrics)
2. Select your language (or request a new one)
3. Translate strings directly in the Crowdin interface
4. Translations are automatically synced to the repository

### Translation Tips

- Keep translations concise - UI space is limited
- Preserve placeholders like `$1`, `$2` in strings
- Check context in the `description` field for each string
- **Match word count** - If the original is one word, use one word in translation. Multi-word translations can break layouts
- When confused between options, use your best judgement to pick the most concise term
- Avoid literal translations that sound unnatural - prefer what a native speaker would say

### Quality Standards

Translations that don't follow these guidelines may be removed:
- Using multiple words when the original is a single word
- Ignoring UI space constraints
- Translations that don't match the tone/context

When in doubt, check how similar apps translate the term in your language.

### I18n Key Naming Convention

Keys follow `<area>_<component>_<element>` pattern:
- `options_tab_general` - Options page, tab, general
- `marketplace_install` - Marketplace, install button
- `lyrics_source` - Lyrics display, source label

## Questions?

- Open a [discussion](https://github.com/better-lyrics/better-lyrics/discussions)
- Join our [Discord](https://discord.gg/UsHE3d5fWF)

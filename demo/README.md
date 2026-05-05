# MindMapVault FOSS Browser Demo

Standalone browser-only demo app for the FOSS canvas editor.

## Goals

- Interactive canvas UI in browser.
- No account, no backend, no server save flow.
- Draft state stored only in browser localStorage.
- Encrypted tree blob export available from the top banner.

## Run locally

From repository root:

```bash
pnpm dev:demo
```

Open:

```text
http://127.0.0.1:5275/demo/
```

## Build

From repository root:

```bash
pnpm build:demo
```

This writes static output to:

```text
demo/dist
```

If you want to commit the build artifacts, commit `demo/dist`.

## Deploy from committed `demo/dist`

Recommended flow:

1. Build the demo:

```bash
pnpm build:demo
```

2. Commit and push `demo/dist`.

3. In GitHub repository settings:
- Go to `Settings -> Pages`.
- Source: `Deploy from a branch`.
- Branch: choose your publish branch.
- Folder: choose `/demo/dist` (if available in your repo Pages UI), otherwise use a Pages Action workflow that publishes this folder.

## Required GitHub rights

- You need repo `Admin` rights to change Pages settings.
- If you deploy via GitHub Actions, workflow permissions must allow `Read and write` and have `Pages` enabled.
- If branch protection is enabled, you need permission to push commits that include `demo/dist`.

## Build for GitHub Pages `/demo`

From repository root:

```bash
pnpm build:demo:pages
```

This writes static output to:

```text
docs/demo
```

The Vite base path is configured as `/demo/` in `demo/vite.config.ts`.

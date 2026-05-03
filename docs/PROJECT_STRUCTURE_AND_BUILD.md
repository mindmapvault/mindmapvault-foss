# Project Structure And Build Guide

This document explains how the repository is organized and how to build the desktop app.

## Top-Level Structure

- frontend_app/
  - React + TypeScript UI
  - editor, local unlock flow, crypto helpers, and app pages
- desktop/src-tauri/
  - Rust Tauri host
  - local storage commands and desktop packaging config
- notes/
  - project documentation and operational notes
- .github/workflows/
  - CI workflows, including desktop artifact builds

## Main Runtime Flow

- The UI runs from frontend_app.
- Tauri embeds that UI inside a native WebView window.
- Filesystem operations and local persistence go through desktop/src-tauri commands.

## Build Prerequisites

- Node.js 20+
- pnpm 10+
- Rust stable toolchain
- Tauri OS dependencies for your platform

## Build Commands

Install dependencies:

```bash
pnpm install
```

Build frontend:

```bash
pnpm --dir frontend_app build
```

Run desktop app in development:

```bash
pnpm run tauri:dev
```

Build desktop bundles:

```bash
pnpm run tauri:build
```

## Desktop Outputs

- Windows: EXE and NSIS installer
- Linux: AppImage

Both outputs are native desktop packages of the same WebView-based app.

## WSL Note For Linux Builds

Linux desktop builds are most reliable when run from a native WSL path, not /mnt/c.

Recommended pattern:

- sync repository to a native WSL folder
- run pnpm install and pnpm --dir frontend_app tauri:build there

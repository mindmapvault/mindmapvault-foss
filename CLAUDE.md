# CLAUDE.md — mindmapvault-foss

The agent contract for this repository lives in
**`.github/copilot-instructions-foss.md`** — scope, the local-only rules, the
crypto boundaries, release hygiene, and the "never suggest" list. Read it before
changing anything, and keep it as the single source of truth.

This file exists so Claude Code picks that contract up, and to carry the one
subject it does not cover in enough depth: **how this code is tested, and why
the obvious way does not work here.**

---

## The bug class this repo actually has

The editor is one codebase running in **three shells**:

| Shell | Router | Tauri IPC | Backend |
|---|---|---|---|
| `demo/`, `mobile-demo/` | **none** | no | no |
| `desktop/` (Tauri) | `BrowserRouter` | yes | no |
| the hosted app (sibling repo) | `BrowserRouter` | no | yes |

A unit test renders a component **in isolation**, which means it supplies
whatever context the component asks for. So a component that calls
`useNavigate()` unconditionally passes every unit test in this repo and then
blanks the page in the one shell that has no `<Router>`.

That is not hypothetical. In September 2026 an external reviewer opened the
browser demo, clicked the settings gear, and got
`useNavigate() may be used only in the context of a <Router> component` on a
white screen. 276 unit tests were green. The same review found the Account tab
calling Tauri commands in a browser, which fails the same way for the same
reason.

**The lesson is not "write more unit tests."** Unit tests cannot see this class
by construction. Coverage of the editor is already good; what was missing was
any test that ran the editor *as a shell*.

---

## The layers, and what each one is for

Add a test at the **cheapest layer that can see the bug**. Most defects here
belong to one specific layer and are invisible to the others.

| Layer | Catches | Cost |
|---|---|---|
| **Type check** (`tsc --noEmit`) | truncated JSX, bad props, missing imports | seconds |
| **Unit / component** (vitest) | logic, parsers, geometry, crypto, format round-trips | seconds |
| **Shell smoke** (Playwright, per shell) | *"works in one shell, dies in another"* — missing context, missing IPC, blank screens | ~1 min |
| **Interaction** (Playwright) | panels that do not close each other, dialogs that trap focus, popups that vanish under the pointer | ~1 min |
| **Desktop E2E** (WebdriverIO + `@wdio/tauri-service`) | native menus, file dialogs, the real WebView | minutes |
| **Build gates** (scripts) | version skew, offline parity, format round-trip fidelity | seconds |

Mapping the four defects from that review onto this table is the quickest way
to understand it:

- blank screen on Settings → **shell smoke**
- menus not closing each other → **interaction**
- export → re-import lost formatting → **unit** (`utils/__tests__/roundTrip.test.ts`)
- shipped binaries labelled with the wrong version → **build gate**

Only one of the four was a browser problem at all.

---

## What must run when

```
pre-commit   (~10 s)   tsc --noEmit + vitest on changed files
pre-push     (~90 s)   full vitest + round-trip gate + version gate
                       + shell smoke against the demo
CI           (minutes) all of the above × three shells, + cargo check/test
release                WebdriverIO against a real desktop build
```

**The demo smoke test belongs in `pre-push` specifically because the demo needs
no backend and no Tauri.** It is the only browser test cheap enough to run on
every push, and it is the one that would have caught the blank screen. Anything
needing a backend or a compiled desktop binary belongs in CI or at release, or
it will be disabled within a week.

---

## Rules that came from something going wrong

**A skipped test has not tested anything.** Specs that skip themselves when a
feature is switched off report green. Read the skip count, and prefer a failure
over a skip when the reason is "the selector was not found" — that is the bug,
not a reason to stand down.

**The smoke test's primary assertion is "nothing threw."** Not "the feature
works". Collect `pageerror` and `console.error` over a pass that opens every
menu, dialog and settings tab, then assert the list is empty and the app root
still has children:

```js
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// …click everything…
expect(errors).toEqual([]);
expect(await page.locator('#root').locator('*').count()).toBeGreaterThan(0);
```

That last line is blank-screen detection. It is three words long and it is the
single highest-value assertion in this repository.

**A gate that warns is not a gate.** `scripts/version-check.js` printed
`Warning: main project versions differ` and exited 0, so 0.3.37 shipped with
binaries named 0.3.36 and had to be reissued as 0.3.38. If a check is worth
running it is worth failing.

**Every new format needs a fidelity mask entry, not a new test file.**
`utils/__tests__/roundTrip.test.ts` exports a fixture tree that sets every field
the editor supports and diffs it against a per-format mask. Teaching a format a
new field is a one-line mask change that the suite then enforces for ever.
Adding a bespoke test instead means the next format silently drops it.

**Compatibility is tested against real files, not ones we wrote.**
`utils/__tests__/compat.test.ts` reads fixtures produced by the actual
applications — a genuine FreeMind 1.1.0 export, eleven maps from the
freeplane.org gallery spanning format versions 0.9.0 to 1.2.0. A parser that
only reads its own writer's output is a parser that has never been tested.

---

## Current state, honestly

| | exists | missing |
|---|---|---|
| type check | ✅ CI | in a pre-commit hook |
| unit / component | ✅ 20 files, 276 tests | — |
| round-trip + compat gates | ✅ `pnpm check:roundtrip` | — |
| offline parity | ✅ `check_frontend_offline_parity.mjs` (static) | its runtime counterpart |
| **shell smoke** | ❌ **nothing** | the whole layer |
| **interaction** | ❌ nothing | menu mutual exclusion is still an open defect |
| desktop E2E | ❌ nothing | release-time only |
| version gate | ⚠️ warns | must fail |

Before adding editor features, close the shell-smoke row. It is the layer that
already cost this project a public review.

---

## Commands

```bash
pnpm install
pnpm dev:app                 # the full app
pnpm dev:demo                # the browser demo — no backend, no Tauri
pnpm test:app                # vitest
pnpm check:roundtrip         # import/export fidelity gate
node scripts/version-check.js
pnpm tauri:build             # desktop bundle
```

CI (`.github/workflows/ci.yml`) runs the frontend job — type check, vitest,
round-trip gate, offline parity — and a desktop job doing `cargo check` and
`cargo test`. Before 0.6.0 **no workflow ran the tests at all**, which is the
real reason an outsider found those four defects first.

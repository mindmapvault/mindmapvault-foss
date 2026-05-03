# Weekpoint Check 0.3.25

Date: 2026-05-03
Scope: mindmapvault-foss and server parity checks for overlapping local-mode surfaces.

## Status Snapshot

- Fixed in FOSS: 4, 5, 6, 11, 12, 13
- Mirrored in server local-mode surfaces: 5, 6, 11, 12, 13
- Remaining open weekpoints from the OSS list: 1, 2, 3, 7, 8, 9, 10

## What Was Verified

1. Point 11 (local auth state)
- `isAuthenticated()` now treats local sessions as authenticated when username + session keys are present.

2. Point 12 (plaintext `vault_color` leakage)
- Desktop local store write path now scrubs `vault_color` from `index.json`.
- Local-mode UI color preference persists via browser localStorage key `vault-color-{vaultId}`.

3. Point 13 (Argon2 salt size)
- Salt generation changed from 16 to 32 bytes in local unlock and rotation/share salt generation paths.

4. Point 5 (index lock)
- Process-level mutex guards index read-modify-write sequences in local desktop store.

5. Point 6 (entry integrity MAC)
- HMAC-SHA256 entry MAC is stamped on writes.
- Local integrity verification command is available to detect tamper/missing MAC states.

## Validation Commands

- FOSS desktop Rust: cargo check (pass)
- FOSS frontend TS: pnpm exec tsc --noEmit (pass)
- Server desktop Rust: cargo check (pass)
- Server frontend TS: pnpm exec tsc --noEmit (pass)

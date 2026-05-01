# Contributing

Thanks for your interest in MindMapVault OSS.

This repository contains the local‑only, offline‑first, no‑telemetry edition of MindMapVault.
All contributions must preserve this privacy‑first model.

## Workflow

1. Fork and create a feature branch.
2. Keep changes focused and minimal.
3. Add tests or validation notes when behavior changes.
4. Open a pull request with a clear summary.

## Coding Expectations

- Preserve client‑side encryption for all vault content.
- Do not introduce network requests, analytics, or telemetry.
- Avoid logs that expose decrypted content, secrets, or key material.
- Keep the desktop local mode stable as the default path.
- Ensure new code paths remain auditable and consistent with the security model.

## Security‑Relevant Changes

Changes affecting storage, crypto, unlock flows, or profile handling should:

- maintain encrypted‑at‑rest guarantees
- avoid plaintext leakage in logs or diagnostics
- include regression tests where practical
- document security‑relevant behavior changes in the PR description

For more details, see SECURITY.md.


## Commit Guidelines

- Use clear commit messages describing user-visible changes.
- Keep unrelated refactors out of feature fixes.
- Reference issues or docs when modifying security‑sensitive areas.

# Security Policy - MindMapVault FOSS

This document defines the security model, threat boundaries, and disclosure process for the FOSS desktop edition of MindMapVault.

## Scope

MindMapVault FOSS is a local-first desktop application (React + Tauri).

Security goals:

- preserve confidentiality of vault content at rest through local encryption
- avoid mandatory remote services for core create/edit/save/open workflows
- isolate local users by profile-specific key material and unlock state
- keep security-relevant behavior auditable in this repository

Out of scope:

- complete protection after full endpoint compromise
- replacement for operating system hardening or full-disk encryption
- anonymity guarantees or anti-traffic-analysis guarantees

## Vulnerability Reporting

Please report vulnerabilities privately and do not open a public issue for active security concerns.

Recommended process:

1. Use GitHub Security Advisories for this repository when available.
2. If private advisory reporting is unavailable, contact maintainers through private channels listed in project metadata.
3. Include reproduction steps, impact, affected versions/commits, and proposed mitigations if possible.

Response targets (best effort):

- initial triage acknowledgment: within 7 days
- status update after verification: within 14 days

Disclosure policy:

- coordinated disclosure is preferred
- fixes may be released before full technical details are published
- public write-up should follow once users have practical upgrade guidance

## Security Architecture

Security-relevant components:

1. frontend_app/ - encryption, decryption, key derivation, unlock/session logic
2. desktop/src-tauri/ - local file IO, profile storage, migration handling
3. local filesystem - encrypted vault artifacts and profile records

Boundary intent:

- cryptographic operations happen on the client side
- the host layer manages storage and migrations of opaque encrypted data
- plaintext map content should not be required outside active local session use

Reference locations:

- frontend_app/src/crypto/
- frontend_app/src/storage/local.ts
- desktop/src-tauri/src/local_store.rs

## Cryptography Model

The implementation currently uses primitives that include:

- Argon2id for password-based key derivation
- HKDF-SHA256 for key derivation separation
- AES-GCM for authenticated encryption
- X25519 and ML-KEM-768 in hybrid encapsulation flows

Design intent:

- user secrets are not persisted as plaintext credentials
- sensitive vault content and encrypted metadata are stored encrypted at rest
- key material required for ongoing operations is derived/unwrapped locally at unlock time

## Local Data And Session Handling

Conceptual on-disk structure:

```text
AppConfig/
        local_store_config.json
        profiles/
                <username>.json

AppData/local/
        <active-username>/
                meta.json
                vaults/
                        index.json
                        <vault-id>.md
                        <vault-id>.bin  (legacy migration input)
```

Operational guarantees (design-level):

- profile selection does not implicitly unlock other profiles
- encrypted artifacts remain encrypted at rest between sessions
- session key material is intended for active session memory usage, not long-term plaintext persistence

## Threat Model

### In scope protections

- reducing plaintext exposure by avoiding required cloud dependency in core workflows
- protecting at-rest local vault content from casual file inspection without unlock secret
- preventing straightforward cross-profile unlock confusion on shared systems

### Residual risks

- compromised host OS (malware, keyloggers, memory scraping, screen capture)
- weak user passphrases enabling offline guessing attacks
- insecure handling of plaintext exports by the user
- third-party software on the same endpoint with elevated privileges

## User Security Responsibilities

Recommended baseline controls:

- full-disk encryption (BitLocker, FileVault, LUKS, or equivalent)
- strong OS account authentication and automatic screen lock
- strong, unique passphrases for local profile unlock
- secure backup strategy for encrypted vault data
- prompt installation of app and OS security updates

## Telemetry And Logging Policy

Project policy for this repository:

- no hidden telemetry pipeline is introduced for core local operation
- no intentional logging of secrets, passphrases, decrypted vault content, or private keys
- diagnostics must be redacted and documented when added

## Secure Development Requirements

Changes touching storage, crypto, unlock flows, or profile handling should:

- preserve client-side encryption boundaries
- avoid introducing plaintext leakage to logs or analytics
- include regression tests where practical
- include changelog notes for security-relevant behavior changes

## Reviewer Checklist

For security-sensitive changes, reviewers should verify:

1. Core local workflows do not introduce mandatory backend dependencies.
2. Crypto operations remain in client-side code paths.
3. Local storage writes preserve encrypted-at-rest expectations.
4. Logs and error handling do not expose sensitive material.
5. Documentation and implementation remain aligned.

See README.md for project-level overview and notes/AWESOME_PRIVACY_READINESS.md for evaluator context.

# Local Storage, Profiles, And Why Unlock Is Needed

This app is local-first and designed for shared-computer privacy.

## Why The App Still Has "Login" / Unlock

There is no cloud account requirement in this FOSS desktop build.

The unlock screen is a local profile unlock step. It exists for these reasons:

- Different people can use the same computer and the same app install.
- Each local user profile has its own encrypted key material.
- The app should not auto-open one user's vaults for another person.
- You can treat profiles like separate private projects/workspaces on one machine.

In short: unlock is local identity separation plus encryption key unlock, not SaaS sign-in.

## How Data Is Stored On Disk

The desktop host stores data under app-specific local directories.

Conceptual layout:

- profiles/
  - one JSON file per local profile (encrypted private key bundle and profile metadata)
- local/
  - one folder per active local username
  - vaults/index.json with encrypted vault metadata
  - encrypted vault blob files per vault id

Important properties:

- Vault content is encrypted before it is written.
- Titles/notes payloads are encrypted metadata fields, not plaintext notes on disk.
- The Rust host writes opaque bytes/JSON and does not decrypt vault content itself.

See implementation details in desktop/src-tauri/src/local_store.rs.

## Shared Computer Privacy Model

If multiple users access the same computer:

- each user gets a separate local profile
- each profile has separate encrypted key material
- unlocking profile A does not automatically unlock profile B

This model aligns with what privacy-focused users expect from local encrypted workspaces.

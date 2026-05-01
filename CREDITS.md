# MindMapVault OSS Credits and Licenses

_Last updated: April 26, 2026_

Huge thanks to all people, communities, companies, maintainers, and contributors whose work made this project possible.

The OSS edition of MindMapVault stands on the same shared ecosystem as the full project: browser tooling, UI frameworks, desktop runtime work, Rust libraries, cryptography primitives, and community-maintained infrastructure.

This file is a practical acknowledgement page plus a licensing summary for the main components used in this OSS repository. It is informational only and is not legal advice. Always review the upstream `LICENSE` files and official documentation for the exact versions you redistribute.

## Main OSS stack

| Component | What it is for | Used for here | License | What it usually requires |
| --- | --- | --- | --- | --- |
| React | UI library | Main app UI | MIT | Keep copyright and license notice in redistributions. |
| React DOM | Browser renderer for React | Browser rendering for the OSS app | MIT | Keep copyright and license notice in redistributions. |
| React Router DOM | Routing | Client-side navigation | MIT | Keep copyright and license notice in redistributions. |
| Zustand | State management | UI and theme state | MIT | Keep copyright and license notice in redistributions. |
| @xyflow/react (React Flow) | Graph canvas and interaction framework | Mind-map editor viewport and interaction backbone | MIT | Keep copyright and license notice in redistributions. |
| DOMPurify | HTML sanitization | Sanitizing rendered markdown content | MPL-2.0 OR Apache-2.0 | Apache path requires preserving notices; MPL path has file-level copyleft obligations on modified covered files. |
| marked | Markdown parser | Rendering markdown documents in the landing experience | MIT | Keep copyright and license notice in redistributions. |
| lucide-react | Icon library | App and landing icons | ISC | Keep copyright and license notice in redistributions. |
| Tailwind CSS | Utility-first CSS framework | UI styling | MIT | Keep copyright and license notice in redistributions. |
| Vite | Frontend bundler and dev server | Building the OSS frontend | MIT | Keep copyright and license notice in redistributions. |
| TypeScript | Type system and compiler tooling | Type-checked frontend codebase | Apache-2.0 | Preserve notices and license text in redistributions. |

## Crypto and data helpers

| Component | What it is for | Used for here | License | What it usually requires |
| --- | --- | --- | --- | --- |
| @noble/curves | Elliptic-curve cryptography primitives | Client-side crypto helpers | MIT | Keep copyright and license notice in redistributions. |
| @noble/hashes | Hashing primitives | Browser-side hashing and related crypto support | MIT | Keep copyright and license notice in redistributions. |
| @noble/post-quantum | Post-quantum cryptography primitives | Experimental/future-facing crypto support | MIT | Keep copyright and license notice in redistributions. |
| hash-wasm | High-performance hashing in WebAssembly | Browser-side hashing support | MIT | Keep copyright and license notice in redistributions. |

## Desktop OSS host stack

| Component | What it is for | Used for here | License | What it usually requires |
| --- | --- | --- | --- | --- |
| Tauri | Desktop application framework | Windows and Linux desktop shell for the OSS local edition | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| @tauri-apps/api | JS bindings for desktop features | Frontend bridge into the Tauri host | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| @tauri-apps/cli | Build and packaging CLI | Local development and packaging | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| tauri-plugin-fs | Filesystem access plugin | Local vault file operations | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| tauri-plugin-dialog | Native dialog plugin | File picker and desktop dialogs | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| tauri-plugin-shell | Shell/plugin utilities | Desktop shell integration where enabled | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| rfd | Native file dialog library | Cross-platform file-picker integration | MIT OR Apache-2.0 | Preserve license and notice text; comply with the chosen license terms. |

## Rust application ecosystem used by the desktop host

| Component | What it is for | Used for here | License | What it usually requires |
| --- | --- | --- | --- | --- |
| Rust | Systems language and toolchain | Desktop host and supporting crates | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| Serde | Serialization framework | JSON and model serialization | MIT OR Apache-2.0 | Preserve license and notice text; comply with the chosen license terms. |
| serde_json | JSON support | JSON parsing and encoding | MIT OR Apache-2.0 | Preserve license and notice text; comply with the chosen license terms. |
| uuid | Identifiers | Stable IDs for records and payloads | Apache-2.0 OR MIT | Preserve license and notice text; comply with the chosen license terms. |
| chrono | Date/time handling | Timestamps and formatted time handling | MIT OR Apache-2.0 | Preserve license and notice text; comply with the chosen license terms. |
| thiserror | Error definitions | Desktop host error types | MIT OR Apache-2.0 | Preserve license and notice text; comply with the chosen license terms. |

## Practical notes

- Most direct OSS dependencies used here are permissive licenses such as `MIT`, `Apache-2.0`, `ISC`, or dual `MIT OR Apache-2.0` terms.
- `DOMPurify` is published as `MPL-2.0 OR Apache-2.0`; teams should choose and comply with one of those paths deliberately.
- This OSS repository preserves the same privacy-first direction as the wider project: plaintext vault content and decryption keys should remain on the client side.

## Thanks again

Thank you to the open-source maintainers, standards authors, security researchers, UI framework contributors, package authors, Rust and JavaScript communities, and desktop/runtime teams whose work made this repository possible.
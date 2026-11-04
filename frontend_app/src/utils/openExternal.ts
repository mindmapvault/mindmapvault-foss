import { isTauri } from '../storage';

// Schemes a link may never open: they run code, read local files or point
// back into the app itself.
const BLOCKED_SCHEMES = new Set(['javascript', 'vbscript', 'data', 'file', 'blob', 'about', 'tauri', 'asset', 'ipc']);

/**
 * The scheme of a link in lower case (`obsidian` for `obsidian://open?vault=…`),
 * or null when it has none. `example.com:8080/x` is a host and port, not a scheme.
 */
export function linkScheme(raw: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*):(.*)$/is.exec(raw.trim());
  if (!match) return null;
  if (/^\d+(?:[/?#]|$)/.test(match[2])) return null;
  return match[1].toLowerCase();
}

/**
 * What a link on a node opens. A bare address gets `https://`; links to other
 * apps (`obsidian:`, `zotero:`, `mailto:` …) are kept as typed; blocked
 * schemes give null.
 */
export function linkTarget(raw: string): string | null {
  const url = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!url) return null;
  const scheme = linkScheme(url);
  if (!scheme) return `https://${url}`;
  return BLOCKED_SCHEMES.has(scheme) ? null : url;
}

function isBlocked(url: string): boolean {
  const scheme = linkScheme(url);
  return scheme !== null && BLOCKED_SCHEMES.has(scheme);
}

// Schemes the user has agreed to open in another app during this session.
const confirmedSchemes = new Set<string>();

// Desktop only: a link to another app (obsidian:, zotero: …) is opened by the
// Rust side, which checks the scheme again. Asked once per scheme, because a
// map may come from someone else.
async function openAppLinkInTauri(url: string, scheme: string): Promise<void> {
  const [{ ask }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core'),
  ]);
  const known = scheme === 'mailto' || scheme === 'tel' || confirmedSchemes.has(scheme);
  if (!known) {
    const ok = await ask(`Open this link in another app?\n\n${url}`, {
      title: 'Open link',
      kind: 'info',
      okLabel: 'Open',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    confirmedSchemes.add(scheme);
  }
  await invoke('open_app_link', { url });
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isBlocked(url)) return;
  const scheme = linkScheme(url);
  if (isTauri()) {
    try {
      if (scheme && scheme !== 'http' && scheme !== 'https') {
        await openAppLinkInTauri(url, scheme);
      } else {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
      }
    } catch (e) {
      console.warn('Could not open link', e);
    }
    return;
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    // ignore
  }
}

export function handleDelegatedLinkClick(e: MouseEvent, fallback?: (url: string) => void) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const a = target.closest ? (target.closest('a') as HTMLAnchorElement | null) : null;
  if (a && a.href) {
    e.preventDefault();
    e.stopPropagation();
    try {
      void openExternalUrl(a.href);
    } catch (err) {
      if (fallback) fallback(a.href);
    }
  }
}

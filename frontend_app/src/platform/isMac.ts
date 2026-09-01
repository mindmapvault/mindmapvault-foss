/**
 * True on macOS. `navigator.platform` is deprecated but still the most
 * reliable signal inside a Tauri WebView (no `navigator.userAgentData` on
 * WebKit); `userAgent` is the fallback for environments where it's blank.
 */
export const isMac: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /Mac/i.test(platform) || /Macintosh/i.test(ua);
})();

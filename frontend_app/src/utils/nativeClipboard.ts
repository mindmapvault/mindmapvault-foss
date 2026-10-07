/**
 * An image on the OS clipboard, read through Tauri rather than the WebView.
 *
 * On macOS and Windows a paste on the canvas arrives as a `paste` event with
 * the image in `clipboardData`. WebKitGTK on Linux never delivers one there:
 * text pastes into fields work, but an image pasted onto the canvas fires
 * nothing the page can read. The editor falls back to this when Ctrl+V on the
 * canvas brought no image through the event.
 *
 * Null outside the desktop app, and when the clipboard holds no image.
 */

import { isTauri } from '../storage';

export async function readNativeClipboardImage(): Promise<File | null> {
  if (!isTauri()) return null;
  try {
    const { readImage } = await import('@tauri-apps/plugin-clipboard-manager');
    const image = await readImage();
    const [{ width, height }, rgba] = await Promise.all([image.size(), image.rgba()]);
    if (!width || !height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'pasted-image.png', { type: 'image/png' }) : null;
  } catch {
    // readImage rejects when the clipboard holds text or nothing at all.
    return null;
  }
}

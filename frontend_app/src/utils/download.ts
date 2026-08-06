import { isTauri } from '../storage';

function buildDialogFilters(filename: string): Array<{ name: string; extensions: string[] }> | undefined {
  const extension = filename.split('.').pop()?.trim().toLowerCase();
  if (!extension || extension === filename.toLowerCase()) return undefined;

  switch (extension) {
    case 'md':
      return [{ name: 'Markdown', extensions: ['md'] }];
    case 'png':
      return [{ name: 'PNG Image', extensions: ['png'] }];
    case 'pdf':
      return [{ name: 'PDF Document', extensions: ['pdf'] }];
    case 'mm':
      // FreeMind and FreePlane share the .mm extension.
      return [{ name: 'FreeMind / FreePlane Mind Map', extensions: ['mm'] }];
    case 'wxml':
      return [{ name: 'WiseMapping Map', extensions: ['wxml'] }];
    case 'xmind':
      return [{ name: 'XMind Workbook', extensions: ['xmind'] }];
    default:
      return [{ name: `${extension.toUpperCase()} File`, extensions: [extension] }];
  }
}

/** Base64-encode without blowing the call stack on multi-MB exports. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function downloadBlobInTauri(blob: Blob, filename: string): Promise<boolean> {
  if (!isTauri()) return false;

  const [{ save }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core'),
  ]);

  const filePath = await save({
    defaultPath: filename,
    filters: buildDialogFilters(filename),
  });

  if (!filePath) {
    // User cancelled the dialog — handled, don't fall back to a browser download.
    return true;
  }

  // Deliberately NOT plugin-fs writeFile: the fs capability is scoped to the
  // app's own directories, so writing to a user-chosen location like
  // ~/Downloads is rejected as a forbidden path. The Rust command is not
  // subject to the webview ACL, which keeps the fs scope tight.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke('save_export_file', { destPath: filePath, dataBase64: toBase64(bytes) });
  return true;
}

export async function downloadBlob(blob: Blob, filename: string) {
  if (isTauri()) {
    // On desktop this is the only path that works — the browser <a download>
    // fallback below is a no-op in WKWebView/WebKitGTK, so a silent catch here
    // would turn a real failure into "nothing happened".
    await downloadBlobInTauri(blob, filename);
    return;
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // Append to DOM so the link is clickable in all envs
    document.body.appendChild(a);
    // Use timeout to avoid potential immediate DOM removal race
    setTimeout(() => {
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, 50);
  } catch (err) {
    // Fallback: try data URL download
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        setTimeout(() => { a.click(); document.body.removeChild(a); }, 50);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      throw e;
    }
  }
}

export async function downloadDataUrl(dataUrl: string, filename: string) {
  // Convert data URL to blob and use downloadBlob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return downloadBlob(blob, filename);
}

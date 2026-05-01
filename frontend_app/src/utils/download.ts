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
    default:
      return [{ name: `${extension.toUpperCase()} File`, extensions: [extension] }];
  }
}

async function downloadBlobInTauri(blob: Blob, filename: string): Promise<boolean> {
  if (!isTauri()) return false;

  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);

  const filePath = await save({
    defaultPath: filename,
    filters: buildDialogFilters(filename),
  });

  if (!filePath) {
    return true;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(filePath, bytes);
  return true;
}

export async function downloadBlob(blob: Blob, filename: string) {
  try {
    if (await downloadBlobInTauri(blob, filename)) return;
  } catch (err) {
    // Fall back to browser downloads if the native desktop path is unavailable.
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

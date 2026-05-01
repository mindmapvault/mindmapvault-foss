const textEncoder = new TextEncoder();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function renderImagePreview(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const width = 320;
  const height = 200;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas preview rendering is unavailable');
  }

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;
  ctx.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);

  ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
  ctx.fillRect(0, height - 42, width, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(file.name.slice(0, 28), 16, height - 16);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Failed to encode image preview'));
    }, 'image/webp', 0.88);
  });

  bitmap.close();
  return blobToBytes(blob);
}

function renderCardPreviewSvg(file: File): Uint8Array {
  const ext = escapeXml(getExtension(file.name));
  const name = escapeXml(file.name.length > 34 ? `${file.name.slice(0, 31)}...` : file.name);
  const contentType = escapeXml(file.type || 'application/octet-stream');
  const size = escapeXml(formatBytes(file.size));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <defs>
        <linearGradient id="card-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="22" fill="url(#card-bg)" />
      <rect x="18" y="18" width="284" height="164" rx="18" fill="#020617" stroke="#334155" />
      <rect x="34" y="36" width="84" height="84" rx="16" fill="#7c3aed" />
      <text x="76" y="87" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="26" font-weight="700" fill="#ffffff">${ext}</text>
      <text x="142" y="72" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${name}</text>
      <text x="142" y="102" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#94a3b8">${contentType}</text>
      <text x="142" y="126" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#94a3b8">${size}</text>
      <text x="34" y="156" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#cbd5e1">Encrypted preview card</text>
    </svg>
  `.trim();

  return textEncoder.encode(svg);
}

export async function createEncryptedFilePreview(file: File): Promise<{
  bytes: Uint8Array;
  contentType: string;
  kind: 'image' | 'card';
}> {
  if (file.type.startsWith('image/')) {
    try {
      return {
        bytes: await renderImagePreview(file),
        contentType: 'image/webp',
        kind: 'image',
      };
    } catch {
      // Fall back to the generic card preview below.
    }
  }

  return {
    bytes: renderCardPreviewSvg(file),
    contentType: 'image/svg+xml',
    kind: 'card',
  };
}
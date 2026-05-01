/**
 * Exports an SVG element as a single-page A4-landscape PDF download.
 * - Removes foreignObject elements to avoid canvas taint issues.
 * - Resolves CSS custom properties so they render correctly on canvas.
 * - Fills the canvas with the app's current canvas background color.
 * - Draws a version + datetime watermark in the bottom-right corner.
 * - Builds a minimal PDF (no external dependencies).
 */

import { downloadBlob } from './download';

/** Resolve all known SVG CSS custom properties to their computed values. */
function resolveCssVarsInSvg(svgStr: string): { resolved: string; bgColor: string } {
  const docStyle = getComputedStyle(document.documentElement);
  const knownVars = [
    '--mm-canvas-bg', '--mm-node-fill', '--mm-node-stroke', '--mm-node-text',
    '--mm-root-fill', '--mm-root-stroke', '--mm-root-text', '--mm-connection',
    '--mm-collapse-fill', '--mm-collapse-stroke', '--mm-collapse-text',
    '--accent', '--accent-hover', '--mm-statusbar-text',
  ];
  const values = new Map<string, string>(
    knownVars.map((v) => [v, docStyle.getPropertyValue(v).trim()]),
  );
  const bgColor = values.get('--mm-canvas-bg') || '#0f172a';
  const resolved = svgStr.replace(/var\((--[a-zA-Z-]+)(?:\s*,\s*([^)]+))?\)/g, (_match, name: string, fallback?: string) => {
    const value = values.get(name);
    if (value && value.length > 0) return value;
    return fallback?.trim() || 'transparent';
  });
  return { resolved, bgColor };
}

function isValidDate(input: Date): boolean {
  return !Number.isNaN(input.getTime());
}

function normalizeExportDateLabel(raw: string | undefined): string {
  if (raw && raw.trim()) {
    const parsed = new Date(raw);
    if (isValidDate(parsed)) {
      return parsed.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
  }
  const now = new Date();
  return now.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Draw a rounded pill shape and fill it. */
function fillPill(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawProjectLogoMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const outerR = size * 0.46;
  const ringR = size * 0.31;

  
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = '#7C3AED';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.strokeStyle = '#E9D5FF';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#DDD6FE';
  ctx.fill();

  ctx.strokeStyle = '#E9D5FF';
  ctx.lineWidth = Math.max(1, size * 0.085);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - ringR + size * 0.02);
  ctx.lineTo(cx, cy - size * 0.19);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + ringR - size * 0.02, cy);
  ctx.lineTo(cx + size * 0.19, cy);
  ctx.stroke();

  ctx.restore();
}

function drawBrandBadge(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  scale: number,
): { x: number; y: number; w: number; h: number } {
  const text = 'mindmapvault.com';
  const fontSize = 11 * scale;
  const logoSize = 14 * scale;
  const padX = 8 * scale;
  const padY = 6 * scale;
  const gap = 6 * scale;

  ctx.save();
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const textW = ctx.measureText(text).width;
  const badgeW = padX * 2 + logoSize + gap + textW;
  const badgeH = logoSize + padY * 2;
  const x = cw - badgeW - 14 * scale;
  const y = ch - badgeH - 14 * scale;

  ctx.fillStyle = 'rgba(2,6,23,0.72)';
  fillPill(ctx, x, y, badgeW, badgeH, 7 * scale);
  drawProjectLogoMark(ctx, x + padX, y + (badgeH - logoSize) / 2, logoSize);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX + logoSize + gap, y + badgeH / 2);
  ctx.restore();

  return { x, y, w: badgeW, h: badgeH };
}

/** Draw a version + datetime watermark in the bottom-right corner of the canvas. */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number, scale: number,
  versionLabel: string | undefined,
  dateStr: string | undefined,
): void {
  const brand = drawBrandBadge(ctx, cw, ch, scale);
  const normalizedDate = normalizeExportDateLabel(dateStr);
  const label = [versionLabel, normalizedDate].filter(Boolean).join('  ·  ');
  if (!label) return;
  const fSize = 11 * scale;
  ctx.save();
  ctx.font = `600 ${fSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const textW = ctx.measureText(label).width;
  const padH = 10 * scale;
  const padV = 6 * scale;
  const pillW = textW + padH * 2;
  const pillH = fSize + padV * 2;
  const rx = cw - pillW - 14 * scale;
  const ry = Math.max(14 * scale, brand.y - pillH - 8 * scale);
  ctx.fillStyle = 'rgba(0,0,0,0.50)';
  fillPill(ctx, rx, ry, pillW, pillH, 6 * scale);
  

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rx + padH, ry + pillH / 2);
  ctx.restore();
}

/**
 * Render an SVG element to a canvas with correct theme colors and an optional watermark.
 */
export async function renderSvgToCanvas(
  svg: SVGSVGElement,
  versionLabel?: string,
  dateStr?: string,
): Promise<HTMLCanvasElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('foreignObject').forEach((fo) => fo.remove());

  const serializer = new XMLSerializer();
  let svgStr = serializer.serializeToString(clone);
  if (!svgStr.includes('xmlns=')) {
    svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const { resolved, bgColor } = resolveCssVarsInSvg(svgStr);

  const svgW = svg.clientWidth || 1200;
  const svgH = svg.clientHeight || 800;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = svgW * scale;
  canvas.height = svgH * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Fill background with the app's current theme color
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render SVG at 2× resolution
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    // Ensure crossorigin is set so rendering doesn't taint canvas when possible
    // (SVG data URIs are same-origin, but defensive set avoids some browser quirks).
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      resolve();
    };
    img.onerror = () => reject(new Error('SVG render failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(resolved);
  });

  // Draw version + datetime watermark
  drawWatermark(ctx, canvas.width, canvas.height, scale, versionLabel, dateStr);

  return canvas;
}

/**
 * Export an SVG element as a themed, watermarked PDF download.
 */
export async function exportSvgAsPdf(
  svg: SVGSVGElement,
  title: string,
  versionLabel?: string,
  dateStr?: string,
): Promise<void> {
  const canvas = await renderSvgToCanvas(svg, versionLabel, dateStr);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const jpegBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const pdfBytes = buildSinglePagePdf(jpegBytes, canvas.width, canvas.height, title);
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  try {
    await downloadBlob(blob, `${title || 'mindmap'}.pdf`);
  } catch (err) {
    // Last-resort fallback: create object URL and click
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'mindmap'}.pdf`;
    document.body.appendChild(a);
    setTimeout(() => { a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }, 50);
  }
}

/** Builds a minimal single-page A4-landscape PDF containing one JPEG image. */
function buildSinglePagePdf(jpeg: Uint8Array, imgW: number, imgH: number, title: string): Uint8Array {
  const enc = new TextEncoder();
  // A4 landscape in points
  const pageW = 841.89;
  const pageH = 595.28;
  const margin = 18;
  const s = Math.min((pageW - margin * 2) / imgW, (pageH - margin * 2) / imgH);
  const dW = +(imgW * s).toFixed(2);
  const dH = +(imgH * s).toFixed(2);
  const ox = +((pageW - dW) / 2).toFixed(2);
  const oy = +((pageH - dH) / 2).toFixed(2);
  const safeTitle = title.replace(/[()\\]/g, '\\$&');
  const contentStr = `q ${dW} 0 0 ${dH} ${ox} ${oy} cm /I Do Q\n`;

  const objStrs: Record<number, string> = {
    1: `1 0 obj\n<</Type /Catalog /Pages 2 0 R /Info 6 0 R>>\nendobj\n`,
    2: `2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n`,
    3: `3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 5 0 R /Resources <</XObject <</I 4 0 R>>>>>>\nendobj\n`,
    5: `5 0 obj\n<</Length ${contentStr.length}>>\nstream\n${contentStr}endstream\nendobj\n`,
    6: `6 0 obj\n<</Title (${safeTitle}) /Creator (Crypt Mind)>>\nendobj\n`,
  };
  const obj4Head = `4 0 obj\n<</Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length}>>\nstream\n`;
  const obj4Foot = `\nendstream\nendobj\n`;

  const parts: Uint8Array[] = [];
  const offsets = new Array<number>(7).fill(0);
  let cursor = 0;

  const addText = (n: number, s: string) => {
    offsets[n] = cursor; const b = enc.encode(s); parts.push(b); cursor += b.length;
  };
  const addBin = (n: number, head: string, body: Uint8Array, foot: string) => {
    offsets[n] = cursor;
    const h = enc.encode(head); const f = enc.encode(foot);
    parts.push(h, body, f); cursor += h.length + body.length + f.length;
  };

  const headerBytes = enc.encode('%PDF-1.4\n');
  parts.push(headerBytes); cursor += headerBytes.length;

  addText(1, objStrs[1]); addText(2, objStrs[2]); addText(3, objStrs[3]);
  addBin(4, obj4Head, jpeg, obj4Foot);
  addText(5, objStrs[5]); addText(6, objStrs[6]);

  const xrefOffset = cursor;
  let xrefStr = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) xrefStr += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xrefStr += `trailer\n<</Size 7 /Root 1 0 R /Info 6 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(enc.encode(xrefStr));

  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

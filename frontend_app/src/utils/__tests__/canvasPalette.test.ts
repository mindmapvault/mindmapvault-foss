import { describe, expect, it } from 'vitest';
import {
  CANVAS_PALETTE_VARS,
  applyCanvasPalette,
  canvasPaletteVars,
  parseHex,
  relativeLuminance,
} from '../canvasPalette';

const STOCK_DARK = '#0f172a';
const STOCK_LIGHT = '#f1f5f9';

describe('canvasPaletteVars', () => {
  it('rejects anything that is not a colour', () => {
    expect(canvasPaletteVars('nonsense')).toBeNull();
    expect(canvasPaletteVars('')).toBeNull();
    expect(canvasPaletteVars('#12345')).toBeNull();
  });

  it('accepts short hex and a missing hash', () => {
    expect(parseHex('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseHex('0f172a')).toEqual({ r: 15, g: 23, b: 42 });
  });

  it('covers every variable it promises to', () => {
    const vars = canvasPaletteVars('#134e4a')!;
    expect(Object.keys(vars).sort()).toEqual([...CANVAS_PALETTE_VARS].sort());
  });

  it('keeps the canvas itself exactly as chosen', () => {
    expect(canvasPaletteVars('#134e4a')!['--mm-canvas-bg']).toBe('#134e4a');
  });

  it('lands close to the stock dark palette when given the stock dark canvas', () => {
    const v = canvasPaletteVars(STOCK_DARK)!;
    // Stock is #1e293b / #334155; derived should be in the same neighbourhood.
    expect(near(v['--mm-node-fill'], '#1e293b', 12)).toBe(true);
    expect(near(v['--mm-node-stroke'], '#334155', 14)).toBe(true);
    expect(near(v['--mm-node-text'], '#e2e8f0', 22)).toBe(true);
  });

  it('raises panels above the canvas rather than sinking them, in both modes', () => {
    for (const canvas of [STOCK_DARK, STOCK_LIGHT, '#134e4a', '#d9f99d']) {
      const v = canvasPaletteVars(canvas)!;
      const fill = relativeLuminance(parseHex(v['--mm-node-fill'])!);
      const bg = relativeLuminance(parseHex(v['--mm-canvas-bg'])!);
      expect(fill).toBeGreaterThan(bg);
    }
  });

  it('gives a light canvas dark ink and a dark border, like the stock light theme', () => {
    const v = canvasPaletteVars(STOCK_LIGHT)!;
    const bg = relativeLuminance(parseHex(v['--mm-canvas-bg'])!);
    expect(relativeLuminance(parseHex(v['--mm-node-text'])!)).toBeLessThan(bg);
    expect(relativeLuminance(parseHex(v['--mm-node-stroke'])!)).toBeLessThan(bg);
  });

  it('keeps a node edge visible against both the node and the canvas', () => {
    for (const canvas of [STOCK_DARK, STOCK_LIGHT, '#134e4a', '#d9f99d', '#ffffff', '#000000']) {
      const v = canvasPaletteVars(canvas)!;
      expect(contrast(v['--mm-node-stroke'], v['--mm-node-fill'])).toBeGreaterThan(1.12);
    }
  });

  it('puts dark text on a pale canvas and light text on a deep one', () => {
    const pale = canvasPaletteVars('#d9f99d')!;
    const deep = canvasPaletteVars('#14532d')!;
    expect(relativeLuminance(parseHex(pale['--mm-node-text'])!)).toBeLessThan(0.2);
    expect(relativeLuminance(parseHex(deep['--mm-node-text'])!)).toBeGreaterThan(0.6);
  });

  it('keeps body text readable against the node it sits on', () => {
    for (const canvas of ['#134e4a', '#d9f99d', '#0f172a', '#f1f5f9', '#7c2d12', '#ffffff', '#000000']) {
      const v = canvasPaletteVars(canvas)!;
      expect(contrast(v['--mm-node-text'], v['--mm-node-fill'])).toBeGreaterThan(4.5);
    }
  });

  it('separates a node from the canvas it sits on', () => {
    for (const canvas of ['#134e4a', '#d9f99d', '#0f172a', '#f1f5f9']) {
      const v = canvasPaletteVars(canvas)!;
      expect(v['--mm-node-fill']).not.toBe(v['--mm-canvas-bg']);
    }
  });
});

describe('applyCanvasPalette', () => {
  it('writes every variable and then clears every one', () => {
    const el = { style: makeStyle() } as unknown as HTMLElement;
    applyCanvasPalette(el, '#134e4a');
    expect(Object.keys((el.style as unknown as Fake).props).length).toBe(CANVAS_PALETTE_VARS.length);
    applyCanvasPalette(el, null);
    expect(Object.keys((el.style as unknown as Fake).props).length).toBe(0);
  });

  it('clears rather than writing junk when the colour is unreadable', () => {
    const el = { style: makeStyle() } as unknown as HTMLElement;
    applyCanvasPalette(el, '#134e4a');
    applyCanvasPalette(el, 'not-a-colour');
    expect(Object.keys((el.style as unknown as Fake).props).length).toBe(0);
  });
});

interface Fake { props: Record<string, string> }
function makeStyle() {
  const props: Record<string, string> = {};
  return {
    props,
    setProperty: (k: string, v: string) => { props[k] = v; },
    removeProperty: (k: string) => { delete props[k]; },
  };
}

function near(a: string, b: string, tolerance: number): boolean {
  const x = parseHex(a)!; const y = parseHex(b)!;
  return Math.abs(x.r - y.r) <= tolerance
    && Math.abs(x.g - y.g) <= tolerance
    && Math.abs(x.b - y.b) <= tolerance;
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a)!);
  const lb = relativeLuminance(parseHex(b)!);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

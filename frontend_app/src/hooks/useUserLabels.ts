import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'user-labels';

const DEFAULT_COLORS = [
  '#7c3aed', '#10b981', '#ef4444', '#f59e0b',
  '#3b82f6', '#ec4899', '#06b6d4', '#f97316',
];

export interface UserLabel {
  name: string;
  color: string;
}

function normalizeHexColor(input: string | undefined, fallback: string): string {
  if (!input) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input.toLowerCase() : fallback;
}

function normalizeLabelName(input: string): string {
  return input.trim().toLowerCase();
}

function sanitizeLabels(input: unknown): UserLabel[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: UserLabel[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const maybeName = (entry as { name?: unknown }).name;
    const maybeColor = (entry as { color?: unknown }).color;
    if (typeof maybeName !== 'string') continue;
    const name = normalizeLabelName(maybeName);
    if (!name || seen.has(name)) continue;
    const fallback = DEFAULT_COLORS[out.length % DEFAULT_COLORS.length];
    out.push({
      name,
      color: normalizeHexColor(typeof maybeColor === 'string' ? maybeColor : undefined, fallback),
    });
    seen.add(name);
  }
  return out;
}

function readLabels(): UserLabel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitizeLabels(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLabels(labels: UserLabel[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
}

export function useUserLabels() {
  const [labels, setLabels] = useState<UserLabel[]>(() => readLabels());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    writeLabels(labels);
  }, [labels]);

  const addLabel = useCallback((name: string, color?: string) => {
    const trimmed = normalizeLabelName(name);
    if (!trimmed) return;
    setLabels((prev) => {
      if (prev.some((l) => l.name === trimmed)) return prev;
      const fallback = DEFAULT_COLORS[prev.length % DEFAULT_COLORS.length];
      const next = [
        ...prev,
        { name: trimmed, color: normalizeHexColor(color, fallback) },
      ];
      writeLabels(next);
      return next;
    });
  }, []);

  const removeLabel = useCallback((name: string) => {
    setLabels((prev) => {
      const next = prev.filter((l) => l.name !== name);
      writeLabels(next);
      return next;
    });
  }, []);

  const updateLabelColor = useCallback((name: string, color: string) => {
    const normalized = normalizeHexColor(color, '#7c3aed');
    setLabels((prev) => {
      const next = prev.map((l) => (l.name === name ? { ...l, color: normalized } : l));
      writeLabels(next);
      return next;
    });
  }, []);

  return { labels, addLabel, removeLabel, updateLabelColor };
}

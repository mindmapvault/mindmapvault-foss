import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isMac } from '../platform/isMac';

export type KeyboardLayoutName = 'freemind' | 'mac';
export type DensityPreset = 'lean' | 'standard' | 'large';
export type TrayPosition = 'top' | 'bottom' | 'left' | 'right';

interface UiState {
  /**
   * `null` until the user picks one explicitly — the effective layout is
   * then `keyboardLayout ?? (isMac ? 'mac' : 'freemind')`, so the
   * per-platform default keeps applying on every future launch until the
   * user overrides it, and never gets "frozen in" as an explicit choice
   * just because the app happened to compute it once.
   */
  keyboardLayout: KeyboardLayoutName | null;
  setKeyboardLayout: (layout: KeyboardLayoutName | null) => void;

  /** Lean / Standard / Large — see docs/UI_REWORK_PLAN.md §2.1. */
  densityPreset: DensityPreset;
  setDensityPreset: (preset: DensityPreset) => void;

  /** `null` = follow the preset's default (off for lean, on otherwise). */
  statusBarOverride: boolean | null;
  setStatusBarOverride: (value: boolean | null) => void;

  /** `null` = follow the preset's default (labels only show at `large`). */
  toolbarLabelsOverride: boolean | null;
  setToolbarLabelsOverride: (value: boolean | null) => void;

  /** `null` = follow the preset's default (on at `large`, off otherwise). */
  buttonShortcutsOverride: boolean | null;
  setButtonShortcutsOverride: (value: boolean | null) => void;

  /** Not derived from density — an explicit toggle, seeded by the preset only when the preset itself changes. */
  colourTrayEnabled: boolean;
  colourTrayPosition: TrayPosition;
  setColourTray: (enabled: boolean, position?: TrayPosition) => void;

  iconTrayEnabled: boolean;
  iconTrayPosition: TrayPosition;
  setIconTray: (enabled: boolean, position?: TrayPosition) => void;

  /** Pinned via right-click on a tray swatch/icon; shown ahead of the curated set. */
  colourFavourites: string[];
  toggleColourFavourite: (color: string) => void;
  iconFavourites: string[];
  toggleIconFavourite: (name: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      keyboardLayout: null,
      setKeyboardLayout: (keyboardLayout) => set({ keyboardLayout }),

      densityPreset: 'standard',
      setDensityPreset: (densityPreset) => set((state) => {
        // Switching preset re-seeds the tray defaults (large -> both on,
        // colour right / icons left) unless the user has never touched
        // them from the initial off state — a deliberate choice to turn a
        // tray on stays even if the preset changes again later.
        const trayDefaults = densityPreset === 'large'
          ? { colourTrayEnabled: true, colourTrayPosition: 'right' as TrayPosition, iconTrayEnabled: true, iconTrayPosition: 'left' as TrayPosition }
          : { colourTrayEnabled: false, iconTrayEnabled: false };
        const userHasCustomizedTrays = state.colourTrayEnabled || state.iconTrayEnabled;
        return { densityPreset, ...(userHasCustomizedTrays ? {} : trayDefaults) };
      }),

      statusBarOverride: null,
      setStatusBarOverride: (statusBarOverride) => set({ statusBarOverride }),

      toolbarLabelsOverride: null,
      setToolbarLabelsOverride: (toolbarLabelsOverride) => set({ toolbarLabelsOverride }),

      buttonShortcutsOverride: null,
      setButtonShortcutsOverride: (buttonShortcutsOverride) => set({ buttonShortcutsOverride }),

      colourTrayEnabled: false,
      colourTrayPosition: 'right',
      setColourTray: (colourTrayEnabled, colourTrayPosition) => set((state) => ({
        colourTrayEnabled,
        colourTrayPosition: colourTrayPosition ?? state.colourTrayPosition,
      })),

      iconTrayEnabled: false,
      iconTrayPosition: 'left',
      setIconTray: (iconTrayEnabled, iconTrayPosition) => set((state) => ({
        iconTrayEnabled,
        iconTrayPosition: iconTrayPosition ?? state.iconTrayPosition,
      })),

      colourFavourites: [],
      toggleColourFavourite: (color) => set((state) => ({
        colourFavourites: state.colourFavourites.includes(color)
          ? state.colourFavourites.filter((c) => c !== color)
          : [...state.colourFavourites, color],
      })),

      iconFavourites: [],
      toggleIconFavourite: (name) => set((state) => ({
        iconFavourites: state.iconFavourites.includes(name)
          ? state.iconFavourites.filter((n) => n !== name)
          : [...state.iconFavourites, name],
      })),
    }),
    { name: 'mindmapvault-ui' },
  ),
);

/** The layout actually in effect: the user's explicit choice, else the per-platform default. */
export function useEffectiveKeyboardLayout(): KeyboardLayoutName {
  const chosen = useUiStore((s) => s.keyboardLayout);
  return chosen ?? (isMac ? 'mac' : 'freemind');
}

export interface ResolvedDensity {
  statusBarVisible: boolean;
  toolbarLabels: boolean;
  buttonShortcuts: boolean;
  toolbarMode: 'essentials' | 'full';
}

/** Turns the preset + overrides into the flags components actually read. */
export function resolveDensity(
  densityPreset: DensityPreset,
  statusBarOverride: boolean | null,
  toolbarLabelsOverride: boolean | null,
  buttonShortcutsOverride: boolean | null,
): ResolvedDensity {
  return {
    statusBarVisible: statusBarOverride ?? densityPreset !== 'lean',
    toolbarLabels: toolbarLabelsOverride ?? densityPreset === 'large',
    buttonShortcuts: buttonShortcutsOverride ?? densityPreset === 'large',
    toolbarMode: densityPreset === 'lean' ? 'essentials' : 'full',
  };
}

export function useResolvedDensity(): ResolvedDensity {
  const densityPreset = useUiStore((s) => s.densityPreset);
  const statusBarOverride = useUiStore((s) => s.statusBarOverride);
  const toolbarLabelsOverride = useUiStore((s) => s.toolbarLabelsOverride);
  const buttonShortcutsOverride = useUiStore((s) => s.buttonShortcutsOverride);
  return resolveDensity(densityPreset, statusBarOverride, toolbarLabelsOverride, buttonShortcutsOverride);
}

import { COLOR_PALETTE } from './MindMapConstants';
import { useUiStore } from '../store/ui';

interface ColorTrayProps {
  orientation: 'horizontal' | 'vertical';
  currentColor: string | null;
  onSelect: (color: string | null) => void;
}

/**
 * Mouse-first colour strip docked to a canvas edge — a convenience next to
 * the F4/B popover picker, not a replacement for it. Right-click a swatch to
 * pin/unpin it to the favourites row at the front of the strip.
 */
export function ColorTray({ orientation, currentColor, onSelect }: ColorTrayProps) {
  const favourites = useUiStore((s) => s.colourFavourites);
  const toggleFavourite = useUiStore((s) => s.toggleColourFavourite);

  const swatch = (color: string, key: string) => (
    <button
      key={key}
      type="button"
      className="mm-tray-swatch"
      style={{
        background: color,
        outline: currentColor === color ? '2px solid var(--text-primary)' : 'none',
        outlineOffset: 1,
      }}
      title={color}
      onClick={() => onSelect(color)}
      onContextMenu={(e) => { e.preventDefault(); toggleFavourite(color); }}
    />
  );

  return (
    <div className={`mm-tray mm-tray--${orientation}`} aria-label="Colour tray">
      <button type="button" className="mm-tray-swatch mm-tray-swatch--clear" title="Default (no colour)" onClick={() => onSelect(null)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="4" y1="4" x2="20" y2="20" /></svg>
      </button>
      {favourites.length > 0 && (
        <>
          <div className="mm-tray-sep" />
          {favourites.map((c) => swatch(c, `fav-${c}`))}
        </>
      )}
      <div className="mm-tray-sep" />
      {COLOR_PALETTE.map((c, i) => swatch(c, `${c}-${i}`))}
    </div>
  );
}

export default ColorTray;

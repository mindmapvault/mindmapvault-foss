import { useState } from 'react';
import { CURATED_ICON_NAMES } from './lucideIconRegistry';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import { useUiStore } from '../store/ui';

interface IconTrayProps {
  orientation: 'horizontal' | 'vertical';
  currentIcons: string[];
  onSelect: (iconName: string | null) => void;
}

/**
 * Mouse-first icon strip docked to a canvas edge — a convenience next to the
 * I popover picker, not a replacement for it. Right-click an icon to
 * pin/unpin it to the favourites row at the front of the strip. `setNodeIcon`
 * already toggles, so clicking a currently-applied icon removes it.
 *
 * Shows the full curated set (scroll to browse, same as the colour tray's
 * 54 swatches) rather than a truncated preview — the search box narrows
 * that down by name once scrolling stops being the fastest way to find one.
 */
export function IconTray({ orientation, currentIcons, onSelect }: IconTrayProps) {
  const favourites = useUiStore((s) => s.iconFavourites);
  const toggleFavourite = useUiStore((s) => s.toggleIconFavourite);
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const shown = CURATED_ICON_NAMES.filter((name) => !favourites.includes(name) && (!q || name.toLowerCase().includes(q)));

  const iconButton = (name: string, key: string) => (
    <button
      key={key}
      type="button"
      className={`mm-tray-icon${currentIcons.includes(name) ? ' active' : ''}`}
      title={name}
      onClick={() => onSelect(name)}
      onContextMenu={(e) => { e.preventDefault(); toggleFavourite(name); }}
    >
      <DynamicLucideIcon name={name} size={16} />
    </button>
  );

  return (
    <div className={`mm-tray mm-tray--${orientation}`} aria-label="Icon tray">
      <div className="mm-tray-search">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          aria-label="Search icons"
        />
      </div>
      <div className="mm-tray-sep" />
      <button type="button" className="mm-tray-icon mm-tray-icon--clear" title="Remove all icons" onClick={() => onSelect(null)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
      {!q && favourites.length > 0 && (
        <>
          <div className="mm-tray-sep" />
          {favourites.map((name) => iconButton(name, `fav-${name}`))}
        </>
      )}
      <div className="mm-tray-sep" />
      {shown.length > 0
        ? shown.map((name) => iconButton(name, name))
        : <span className="mm-tray-empty">No icons match &quot;{search}&quot;</span>}
    </div>
  );
}

export default IconTray;

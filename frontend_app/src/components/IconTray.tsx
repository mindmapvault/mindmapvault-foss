import { CURATED_ICON_NAMES } from './lucideIconRegistry';
import { DynamicLucideIcon } from './DynamicLucideIcon';
import { useUiStore } from '../store/ui';

interface IconTrayProps {
  orientation: 'horizontal' | 'vertical';
  currentIcons: string[];
  onSelect: (iconName: string | null) => void;
  onOpenPicker: () => void;
}

const TRAY_ICON_COUNT = 16;

/**
 * Mouse-first icon strip docked to a canvas edge — a convenience next to the
 * I popover picker, not a replacement for it. Right-click an icon to
 * pin/unpin it to the favourites row at the front of the strip. `setNodeIcon`
 * already toggles, so clicking a currently-applied icon removes it.
 */
export function IconTray({ orientation, currentIcons, onSelect, onOpenPicker }: IconTrayProps) {
  const favourites = useUiStore((s) => s.iconFavourites);
  const toggleFavourite = useUiStore((s) => s.toggleIconFavourite);
  const shown = CURATED_ICON_NAMES.filter((name) => !favourites.includes(name)).slice(0, TRAY_ICON_COUNT);

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
      <button type="button" className="mm-tray-icon mm-tray-icon--clear" title="Remove all icons" onClick={() => onSelect(null)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
      {favourites.length > 0 && (
        <>
          <div className="mm-tray-sep" />
          {favourites.map((name) => iconButton(name, `fav-${name}`))}
        </>
      )}
      <div className="mm-tray-sep" />
      {shown.map((name) => iconButton(name, name))}
      <div className="mm-tray-sep" />
      <button type="button" className="mm-tray-icon" title="More icons…" onClick={onOpenPicker}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
      </button>
    </div>
  );
}

export default IconTray;

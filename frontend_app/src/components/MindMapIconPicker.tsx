import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { iconNames } from 'lucide-react/dynamic';
import { POPULAR_ICONS } from './MindMapConstants';
import { DynamicLucideIcon } from './DynamicLucideIcon';

const GRID_COLS = 8;

interface MindMapIconPickerProps {
  open: boolean;
  currentIcons: string[];
  onSelect: (iconName: string | null) => void;
  onClose: () => void;
  showToast?: (label: string) => void;
}

function kebabToPascal(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function MindMapIconPickerInner({ open, currentIcons, onSelect, onClose, showToast }: MindMapIconPickerProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
    if (open) {
      setSearch('');
      setFocusIdx(-1);
      setTooltip(null);
    }
  }, [open]);

  const allIconNames = useMemo(() => {
    return iconNames.map(kebabToPascal).sort();
  }, []);

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return POPULAR_ICONS;
    const q = search.toLowerCase();
    return allIconNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 120);
  }, [search, allIconNames]);

  const totalItems = filteredIcons.length + 1;

  const focusButton = useCallback((idx: number) => {
    if (!gridRef.current) return;
    const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button.mm-icon-item');
    if (idx >= 0 && idx < buttons.length) {
      buttons[idx].focus();
      setFocusIdx(idx);
    }
  }, []);

  const showTooltipFor = useCallback((el: HTMLElement, text: string) => {
    clearTimeout(tooltipTimer.current);
    const rect = el.getBoundingClientRect();
    const parentRect = el.closest('.mm-icon-picker')?.getBoundingClientRect();
    if (!parentRect) return;
    setTooltip({
      text,
      x: rect.left - parentRect.left + rect.width / 2,
      y: rect.top - parentRect.top - 4,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setTooltip(null), 120);
  }, []);

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = focusIdx;
    let next = idx;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        next = idx + 1 < totalItems ? idx + 1 : 0;
        showToast?.('→ — Move right');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        next = idx - 1 >= 0 ? idx - 1 : totalItems - 1;
        showToast?.('← — Move left');
        break;
      case 'ArrowDown':
        e.preventDefault();
        next = idx + GRID_COLS < totalItems ? idx + GRID_COLS : idx;
        showToast?.('↓ — Move down');
        break;
      case 'ArrowUp':
        e.preventDefault();
        next = idx - GRID_COLS >= 0 ? idx - GRID_COLS : idx;
        showToast?.('↑ — Move up');
        break;
      case 'Home':
        e.preventDefault();
        next = 0;
        showToast?.('Home — First');
        break;
      case 'End':
        e.preventDefault();
        next = totalItems - 1;
        showToast?.('End — Last');
        break;
      case 'Escape':
        e.preventDefault();
        showToast?.('Esc — Close');
        onClose();
        return;
      default:
        return;
    }

    focusButton(next);

    if (gridRef.current) {
      const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button.mm-icon-item');
      if (buttons[next]) {
        const label = next === 0 ? 'Remove all icons' : (filteredIcons[next - 1] ?? '');
        showTooltipFor(buttons[next], label);
      }
    }
  }, [focusIdx, totalItems, filteredIcons, focusButton, onClose, showTooltipFor, showToast]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      focusButton(0);
      showToast?.('↓ — Enter grid');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      showToast?.('Esc — Close');
      onClose();
    }
  }, [focusButton, onClose, showToast]);

  const handleButtonFocus = useCallback((idx: number, label: string, el: HTMLButtonElement) => {
    setFocusIdx(idx);
    showTooltipFor(el, label);
  }, [showTooltipFor]);

  const handleButtonBlur = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const handleMouseEnter = useCallback((label: string, el: HTMLButtonElement) => {
    showTooltipFor(el, label);
  }, [showTooltipFor]);

  if (!open) return null;

  return (
    <div className='mm-icon-picker' role='dialog' aria-label='Icon picker'>
      <div className='mm-icon-picker-header'>
        <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}>
          <circle cx='12' cy='12' r='10' />
          <path d='M8 14s1.5 2 4 2 4-2 4-2' />
          <line x1='9' y1='9' x2='9.01' y2='9' />
          <line x1='15' y1='9' x2='15.01' y2='9' />
        </svg>
        <span>Choose Icons {currentIcons.length > 0 ? `(${currentIcons.length} selected)` : ''}</span>
        <button
          className='mm-btn mm-btn-sm'
          onClick={onClose}
          aria-label='Close icon picker'
          style={{ marginLeft: 'auto', padding: '0 6px', height: 24 }}
        >
          <svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2.5} strokeLinecap='round'>
            <line x1='18' y1='6' x2='6' y2='18' /><line x1='6' y1='6' x2='18' y2='18' />
          </svg>
        </button>
      </div>
      <input
        ref={searchRef}
        className='mm-icon-search'
        placeholder={`Search ${allIconNames.length} icons...`}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setFocusIdx(-1); }}
        onKeyDown={handleSearchKeyDown}
        aria-label='Search icons'
      />
      <div
        ref={gridRef}
        className='mm-icon-grid'
        role='grid'
        aria-label='Icon grid'
        onKeyDown={handleGridKeyDown}
      >
        <button
          className={`mm-icon-item ${currentIcons.length === 0 ? 'active' : ''}`}
          onClick={() => onSelect(null)}
          onFocus={(e) => handleButtonFocus(0, 'Remove all icons', e.currentTarget)}
          onBlur={handleButtonBlur}
          onMouseEnter={(e) => handleMouseEnter('Remove all icons', e.currentTarget)}
          onMouseLeave={hideTooltip}
          aria-label='Remove all icons'
          aria-selected={currentIcons.length === 0}
          tabIndex={focusIdx === 0 ? 0 : -1}
          role='gridcell'
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>x</span>
        </button>
        {filteredIcons.map((name, i) => {
          const isSelected = currentIcons.includes(name);
          const btnIdx = i + 1;
          const humanName = name.replace(/([A-Z])/g, ' $1').trim();
          return (
            <button
              key={name}
              className={`mm-icon-item ${isSelected ? 'active' : ''}`}
              onClick={() => onSelect(name)}
              onFocus={(e) => handleButtonFocus(btnIdx, humanName, e.currentTarget)}
              onBlur={handleButtonBlur}
              onMouseEnter={(e) => handleMouseEnter(humanName, e.currentTarget)}
              onMouseLeave={hideTooltip}
              aria-label={humanName}
              aria-selected={isSelected}
              tabIndex={focusIdx === btnIdx ? 0 : -1}
              role='gridcell'
            >
              <DynamicLucideIcon name={name} size={18} />
            </button>
          );
        })}
        {filteredIcons.length === 0 && (
          <div className='mm-icon-empty'>No icons match "{search}"</div>
        )}
      </div>

      {tooltip && (
        <div
          className='mm-icon-tooltip'
          style={{ left: tooltip.x, top: tooltip.y }}
          role='tooltip'
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export const MindMapIconPicker = memo(MindMapIconPickerInner);

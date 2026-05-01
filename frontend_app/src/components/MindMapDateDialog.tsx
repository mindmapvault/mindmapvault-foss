/**
 * MindMapDateDialog
 *
 * Dialog for setting start / end planning dates on a mind map node.
 *
 * Props:
 * - open: boolean
 * - startDate: string | null — ISO datetime-local value
 * - endDate: string | null
 * - onSave(start, end): save dates
 * - onClose(): close dialog
 */

import { useState, useEffect, useRef, memo } from 'react';

interface MindMapDateDialogProps {
  open: boolean;
  startDate: string | null;
  endDate: string | null;
  onSave: (startDate: string | null, endDate: string | null) => void;
  onClose: () => void;
}

function MindMapDateDialogInner({ open, startDate, endDate, onSave, onClose }: MindMapDateDialogProps) {
  const [start, setStart] = useState(startDate ?? '');
  const [end, setEnd] = useState(endDate ?? '');
  const startRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStart(startDate ?? '');
      setEnd(endDate ?? '');
      setTimeout(() => startRef.current?.focus(), 50);
    }
  }, [open, startDate, endDate]);

  if (!open) return null;

  const handleSave = () => {
    onSave(start || null, end || null);
    onClose();
  };

  const handleClear = () => {
    onSave(null, null);
    onClose();
  };

  return (
    <>
      <div className="mm-overlay" onClick={onClose} />
      <div className="mm-date-dialog">
        <div className="mm-date-header">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Date Planning</span>
          <button className="mm-btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="mm-date-body">
          <label className="mm-date-label">Start date</label>
          <input
            ref={startRef}
            className="mm-date-input"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}
          />
          <label className="mm-date-label">End date</label>
          <input
            className="mm-date-input"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}
          />
        </div>
        <div className="mm-date-footer">
          <button className="mm-btn mm-btn--primary" onClick={handleSave}>Save</button>
          <button className="mm-btn" onClick={onClose}>Cancel</button>
          <button className="mm-btn mm-btn--danger" onClick={handleClear} style={{ marginLeft: 'auto' }}>Clear dates</button>
        </div>
      </div>
    </>
  );
}

export const MindMapDateDialog = memo(MindMapDateDialogInner);

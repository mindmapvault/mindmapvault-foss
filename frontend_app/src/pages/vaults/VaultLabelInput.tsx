/** The "add a label" control, used by the card's settings panel. */

import { useState } from 'react';

export function VaultLabelInput({ draftLabels, onAdd }: { draftLabels: string[]; onAdd: (label: string, color?: string) => void }) {
  const [value, setValue] = useState('');
  const [color, setColor] = useState('#7c3aed');
  const submit = () => {
    const t = value.trim().toLowerCase();
    if (!t || draftLabels.includes(t)) return;
    onAdd(t, color);
    setValue('');
  };
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            submit();
            e.preventDefault();
          }
        }}
        placeholder="Add label…"
        className="h-6 rounded border border-slate-600 bg-surface px-2 text-xs text-white placeholder-slate-500 focus:border-accent focus:outline-none"
      />
      <label title="Label color" className="inline-flex cursor-pointer items-center">
        <span className="h-3 w-3 rounded-full border border-white/50" style={{ backgroundColor: color }} />
        <input
          type="color"
          value={color}
          className="sr-only"
          onChange={(e) => setColor(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim()}
        className="h-6 rounded border border-slate-600 bg-surface px-2 text-[11px] text-slate-200 disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

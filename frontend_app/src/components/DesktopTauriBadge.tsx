export function DesktopTauriBadge() {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden rounded-full border border-[var(--border)] bg-[color:var(--card)]/92 px-3 py-1.5 text-[11px] text-[var(--fg-muted)] shadow-[0_12px_28px_rgba(15,23,42,0.16)] backdrop-blur md:inline-flex">
      <span className="inline-flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          aria-label="Tauri"
          role="img"
          className="h-4 w-4 shrink-0"
        >
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7.5 8.2h9L13 15.8h-2L7.5 8.2z" fill="currentColor" />
          <circle cx="6" cy="5.8" r="1.6" fill="currentColor" />
          <circle cx="18" cy="5.8" r="1.6" fill="currentColor" />
        </svg>
        <span className="tracking-[0.16em] uppercase text-[var(--fg-muted)]">Made with</span>
        <span className="font-medium text-[var(--fg)]">Tauri</span>
      </span>
    </div>
  );
}

export default DesktopTauriBadge;
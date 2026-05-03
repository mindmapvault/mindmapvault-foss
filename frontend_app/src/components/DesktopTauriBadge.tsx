export function DesktopTauriBadge() {
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden rounded-full border border-[var(--border)] bg-[color:var(--card)]/92 px-3 py-1.5 text-[11px] text-[var(--fg-muted)] shadow-[0_12px_28px_rgba(15,23,42,0.16)] backdrop-blur md:inline-flex">
      <span className="inline-flex items-center gap-2">
        <img
          src="/tauri-logo.png"
          alt="Tauri"
          className="h-4 w-auto shrink-0"
          loading="lazy"
        />
        <span className="tracking-[0.16em] uppercase text-[var(--fg-muted)]">Made with</span>
        <span className="font-medium text-[var(--fg)]">Tauri</span>
      </span>
    </div>
  );
}

export default DesktopTauriBadge;
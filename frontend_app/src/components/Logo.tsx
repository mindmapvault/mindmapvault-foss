/**
 * MindMapVault Logo — vault icon based on the v10 design.
 * Vault-only icon (no mindmap branches) for use as favicon / small marks.
 */
interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * Full vault icon — use this wherever the brand mark appears.
 * It renders an inline SVG of the round vault with handle wheel.
 */
export function VaultIcon({ className = '', size = 32 }: LogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 280 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="li-vb" cx="0.38" cy="0.38" r="0.65">
          <stop offset="0%" stopColor="#B07CDB" />
          <stop offset="25%" stopColor="#8B5CF6" />
          <stop offset="55%" stopColor="#6D28D9" />
          <stop offset="80%" stopColor="#4C1D95" />
          <stop offset="100%" stopColor="#2E1065" />
        </radialGradient>
        <linearGradient id="li-or" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E9D5FF" />
          <stop offset="15%" stopColor="#A78BFA" />
          <stop offset="40%" stopColor="#7C3AED" />
          <stop offset="65%" stopColor="#5B21B6" />
          <stop offset="85%" stopColor="#4C1D95" />
          <stop offset="100%" stopColor="#6D28D9" />
        </linearGradient>
        <linearGradient id="li-ir" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#3B0764" />
        </linearGradient>
        <linearGradient id="li-sp" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#E9D5FF" />
          <stop offset="30%" stopColor="#C4B5FD" />
          <stop offset="70%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>
        <linearGradient id="li-wr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DDD6FE" />
          <stop offset="25%" stopColor="#A78BFA" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="75%" stopColor="#6D28D9" />
          <stop offset="100%" stopColor="#C4B5FD" />
        </linearGradient>
        <radialGradient id="li-hc" cx="0.35" cy="0.35" r="0.65">
          <stop offset="0%" stopColor="#DDD6FE" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3B0764" />
        </radialGradient>
        <linearGradient id="li-dr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E0533" />
          <stop offset="50%" stopColor="#3B0764" />
          <stop offset="100%" stopColor="#1E0533" />
        </linearGradient>
      </defs>
      {/* Outer rim */}
      <circle cx="140" cy="140" r="128" fill="url(#li-or)" stroke="#2E1065" strokeWidth="3" />
      <circle cx="140" cy="140" r="121" fill="none" stroke="#1E0533" strokeWidth="4" />
      <circle cx="140" cy="140" r="117" fill="url(#li-ir)" stroke="#4C1D95" strokeWidth="2" />
      <circle cx="140" cy="140" r="112" fill="url(#li-dr)" stroke="#1E0533" strokeWidth="3" />
      {/* Face */}
      <circle cx="140" cy="140" r="107" fill="url(#li-vb)" stroke="#5B21B6" strokeWidth="1.5" />
      <circle cx="140" cy="140" r="95" fill="none" stroke="#7C3AED" strokeWidth="0.7" opacity="0.5" />
      <circle cx="140" cy="140" r="85" fill="none" stroke="#6D28D9" strokeWidth="0.5" opacity="0.35" />
      {/* Sheen */}
      <path d="M70,82 A90,90 0 0,1 180,68" fill="none" stroke="#DDD6FE" strokeWidth="2" opacity="0.15" strokeLinecap="round" />
      {/* Handle wheel */}
      <circle cx="140" cy="140" r="52" fill="none" stroke="url(#li-wr)" strokeWidth="10" />
      <circle cx="140" cy="140" r="46" fill="none" stroke="#2E1065" strokeWidth="1.5" opacity="0.5" />
      {/* Spokes */}
      <rect x="132" y="90" width="16" height="36" rx="5" fill="url(#li-sp)" stroke="#5B21B6" strokeWidth="0.8" />
      <rect x="132" y="154" width="16" height="36" rx="5" fill="url(#li-sp)" stroke="#5B21B6" strokeWidth="0.8" />
      {/* Hub */}
      <circle cx="140" cy="140" r="20" fill="url(#li-hc)" stroke="#A78BFA" strokeWidth="2" />
      <circle cx="140" cy="140" r="13" fill="#1E0533" stroke="#6D28D9" strokeWidth="2" />
      <circle cx="140" cy="140" r="7" fill="#2E1065" stroke="#8B5CF6" strokeWidth="1" />
      <circle cx="140" cy="140" r="3" fill="#DDD6FE" />
      <circle cx="137" cy="137" r="1.5" fill="#F5F3FF" opacity="0.6" />
    </svg>
  );
}

/**
 * Logo with text — vault icon + "MindMapVault" text.
 * Use on landing page header, login, register.
 */
export function LogoWithText({ className = '', size = 32 }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <VaultIcon size={size} />
      <span className="text-lg font-bold text-white">MindMapVault</span>
    </div>
  );
}

/**
 * Logo block — centered vault icon + heading + tagline.
 * Use on login/register pages above the card.
 */
export function LogoBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <VaultIcon className="mx-auto" size={48} />
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">MindMapVault</h1>
      <p className="mt-1 text-sm text-slate-400">Privacy-first mind maps</p>
    </div>
  );
}

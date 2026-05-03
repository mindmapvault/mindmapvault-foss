import { DynamicIcon, iconNames } from 'lucide-react/dynamic';

function toKebab(name: string): string {
  const trimmed = name.trim();
  if (trimmed.includes('-')) {
    return trimmed.toLowerCase();
  }

  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d+)/g, '$1-$2')
    .replace(/(\d+)([a-zA-Z])/g, '$1-$2')
    .toLowerCase();
}

const ICON_ALIASES: Record<string, string> = {
  bus: 'bus-front',
  circlealert: 'circle-alert',
  flower2: 'flower-2',
  morehorizontal: 'ellipsis',
  morevertical: 'ellipsis-vertical',
};

export function DynamicLucideIcon({
  name,
  size = 16,
  color,
  className,
}: {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const normalizedName = toKebab(name);
  const compact = normalizedName.replace(/-/g, '');
  const aliasName = ICON_ALIASES[compact];
  const resolvedName = iconNames.includes(normalizedName as never)
    ? normalizedName
    : (aliasName && iconNames.includes(aliasName as never) ? aliasName : null);

  if (!resolvedName) {
    return null;
  }

  return (
    <DynamicIcon
      name={resolvedName as never}
      size={size}
      color={color}
      className={className}
    />
  );
}

export default DynamicLucideIcon;

import { resolveLucideIcon } from './lucideIconRegistry';

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
  const resolved = resolveLucideIcon(name);
  if (!resolved) {
    return null;
  }

  const Icon = resolved.component;

  return (
    <Icon size={size} color={color} className={className} />
  );
}

export default DynamicLucideIcon;

import { ApiError } from '../api/client';

export interface PlanErrorPrompt {
  title: string;
  message: string;
  ctaLabel: string;
  shouldOpenSubscription: boolean;
}

function formatBytes(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTier(tier?: string): string {
  return tier === 'paid' ? 'Pro' : 'Free';
}

export function getPlanErrorPrompt(error: unknown): PlanErrorPrompt | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (error.capability === 'storage_limit_bytes' || error.code === 'storage_quota_exceeded') {
    const current = formatBytes(error.currentValue);
    const limit = formatBytes(error.limitValue);
    const canUpgrade = error.currentTier === 'free' && error.requiredTier === 'paid';
    return {
      title: 'Cloud storage limit reached',
      message: canUpgrade
        ? `This write would push your ${formatTier(error.currentTier)} plan above its ${limit} cloud limit. You are currently using ${current}.`
        : `This write would exceed your current cloud storage limit of ${limit}. You are currently using ${current}.`,
      ctaLabel: canUpgrade ? 'Open subscription' : 'Review plan',
      shouldOpenSubscription: true,
    };
  }

  if (error.capability === 'max_attachment_size_bytes') {
    return {
      title: 'Attachment too large for this plan',
      message: `This attachment is larger than the ${formatTier(error.currentTier)} limit of ${formatBytes(error.limitValue)}.`,
      ctaLabel: 'Open subscription',
      shouldOpenSubscription: true,
    };
  }

  if (error.capability === 'can_include_attachments_in_shares') {
    return {
      title: 'Share attachments need Pro',
      message: 'Upgrade to the paid plan to include encrypted attachments in public share links.',
      ctaLabel: 'Open subscription',
      shouldOpenSubscription: true,
    };
  }

  if (error.capability === 'max_active_shares') {
    return {
      title: 'Active share limit reached',
      message: `Your current plan allows up to ${error.limitValue ?? 'the configured'} active encrypted shares per vault.`,
      ctaLabel: 'Open subscription',
      shouldOpenSubscription: true,
    };
  }

  if (error.status === 403 && error.code) {
    return {
      title: 'Plan limit reached',
      message: error.message,
      ctaLabel: 'Open subscription',
      shouldOpenSubscription: true,
    };
  }

  return null;
}
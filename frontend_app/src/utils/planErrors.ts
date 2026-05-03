import { ApiError } from '../api/client';

export interface PlanErrorPrompt {
  title: string;
  message: string;
  ctaLabel: string;
}

function formatBytes(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getPlanErrorPrompt(error: unknown): PlanErrorPrompt | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (error.code === 'offline_only') {
    return {
      title: 'Offline-only mode active',
      message: 'This action requires a server API, which is intentionally disabled in MindMapVault FOSS.',
      ctaLabel: 'Dismiss',
    };
  }

  if (error.capability === 'storage_limit_bytes' || error.code === 'storage_quota_exceeded') {
    return {
      title: 'Local storage limit reached',
      message: `This write would exceed local storage limits (${formatBytes(error.currentValue)} used, ${formatBytes(error.limitValue)} available).`,
      ctaLabel: 'Review storage',
    };
  }

  if (error.capability === 'max_attachment_size_bytes') {
    return {
      title: 'Attachment too large',
      message: `This attachment is larger than the configured local limit of ${formatBytes(error.limitValue)}.`,
      ctaLabel: 'Review file',
    };
  }

  if (error.capability === 'can_include_attachments_in_shares') {
    return {
      title: 'Attachment sharing unavailable',
      message: 'Encrypted attachment sharing is not available in local-only mode.',
      ctaLabel: 'Dismiss',
    };
  }

  if (error.capability === 'max_active_shares') {
    return {
      title: 'Active share limit reached',
      message: `This vault reached the configured local share limit (${error.limitValue ?? 'configured'}).`,
      ctaLabel: 'Dismiss',
    };
  }

  if (error.status === 403 && error.code) {
    return {
      title: 'Operation blocked',
      message: error.message,
      ctaLabel: 'Dismiss',
    };
  }

  return null;
}
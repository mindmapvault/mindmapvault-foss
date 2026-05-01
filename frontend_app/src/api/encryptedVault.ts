import type {
  AttachmentDownloadResponse,
  AttachmentMetadata,
  CreateMapShareResponse,
  InitAttachmentResponse,
  InitMapShareAttachmentResponse,
  MapShareOwnerSummary,
} from '../types';
import { api, ApiError } from './client';

async function uploadPresigned(url: string, body: Uint8Array, headers: Record<string, string> = {}): Promise<string | null> {
  const payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  if (url.startsWith('/')) {
    const contentType = headers['Content-Type'] ?? headers['content-type'] ?? 'application/octet-stream';
    const response = await api.postBytes<{ version_id: string }>(url, payload, contentType, headers);
    return response.version_id ?? null;
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: payload,
  });

  if (!res.ok) {
    throw new ApiError(res.status, `Upload failed: ${res.status} ${res.statusText}`);
  }

  return res.headers.get('x-amz-version-id') ?? res.headers.get('X-Amz-Version-Id');
}

async function downloadUrl(url: string): Promise<Uint8Array> {
  if (url.startsWith('/api/')) {
    return api.getBytes(url);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(res.status, `Download failed: ${res.status} ${res.statusText}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

export const encryptedVaultApi = {
  listAttachments: (vaultId: string) =>
    api.get<AttachmentMetadata[]>(`/mindmaps/${encodeURIComponent(vaultId)}/attachments`),
  initAttachment: (
    vaultId: string,
    body: {
      name: string;
      content_type: string;
      size: number;
      node_id?: string;
      encrypted: boolean;
      encryption_meta?: Record<string, unknown>;
    },
  ) => api.post<InitAttachmentResponse>(`/mindmaps/${encodeURIComponent(vaultId)}/attachments/init`, body),
  completeAttachment: (vaultId: string, attachmentId: string, versionId: string, checksumSha256?: string) =>
    api.post<AttachmentMetadata>(
      `/mindmaps/${encodeURIComponent(vaultId)}/attachments/${encodeURIComponent(attachmentId)}/complete`,
      { version_id: versionId, checksum_sha256: checksumSha256 },
    ),
  getAttachmentDownload: (vaultId: string, attachmentId: string) =>
    api.get<AttachmentDownloadResponse>(`/mindmaps/${encodeURIComponent(vaultId)}/attachments/${encodeURIComponent(attachmentId)}/download`),
  updateAttachmentNode: (vaultId: string, attachmentId: string, nodeId?: string) =>
    api.patch<AttachmentMetadata>(`/mindmaps/${encodeURIComponent(vaultId)}/attachments/${encodeURIComponent(attachmentId)}`, { node_id: nodeId }),
  deleteAttachment: (vaultId: string, attachmentId: string) =>
    api.delete<{ ok: boolean }>(`/mindmaps/${encodeURIComponent(vaultId)}/attachments/${encodeURIComponent(attachmentId)}`),
  listShares: (vaultId: string) =>
    api.get<MapShareOwnerSummary[]>(`/mindmaps/${encodeURIComponent(vaultId)}/shares`),
  createShare: (
    vaultId: string,
    body: {
      name: string;
      scope: 'map' | 'node' | 'note';
      include_attachments: boolean;
      passphrase_hint?: string;
      expires_at?: string;
      content_type: string;
      size_bytes: number;
      encryption_meta: Record<string, unknown>;
    },
  ) => api.post<CreateMapShareResponse>(`/mindmaps/${encodeURIComponent(vaultId)}/shares`, body),
  completeShareUpload: (vaultId: string, shareId: string, versionId: string, checksumSha256?: string) =>
    api.post<MapShareOwnerSummary>(
      `/mindmaps/${encodeURIComponent(vaultId)}/shares/${encodeURIComponent(shareId)}/complete`,
      { version_id: versionId, checksum_sha256: checksumSha256 },
    ),
  revokeShare: (vaultId: string, shareId: string) =>
    api.post<MapShareOwnerSummary>(`/mindmaps/${encodeURIComponent(vaultId)}/shares/${encodeURIComponent(shareId)}/revoke`, {}),
  initShareAttachment: (
    vaultId: string,
    shareId: string,
    body: {
      name: string;
      content_type: string;
      size: number;
      node_id?: string;
      source_attachment_id?: string;
      encryption_meta: Record<string, unknown>;
    },
  ) => api.post<InitMapShareAttachmentResponse>(`/mindmaps/${encodeURIComponent(vaultId)}/shares/${encodeURIComponent(shareId)}/attachments`, body),
  completeShareAttachment: (
    vaultId: string,
    shareId: string,
    attachmentId: string,
    versionId: string,
    checksumSha256?: string,
  ) =>
    api.post<unknown>(
      `/mindmaps/${encodeURIComponent(vaultId)}/shares/${encodeURIComponent(shareId)}/attachments/${encodeURIComponent(attachmentId)}/complete`,
      { version_id: versionId, checksum_sha256: checksumSha256 },
    ),
  uploadPresigned,
  downloadUrl,
};

export default encryptedVaultApi;
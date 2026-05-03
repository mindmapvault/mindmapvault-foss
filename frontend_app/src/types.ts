// ── Shared API/backend types ──────────────────────────────────────────────────

export interface Argon2Params {
  m_cost: number;
  t_cost: number;
  p_cost: number;
}

export interface SaltResponse {
  argon2_salt: string;
  argon2_params: Argon2Params;
  login_turnstile_required?: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  classical_public_key: string;
  pq_public_key: string;
  classical_priv_encrypted: string;
  pq_priv_encrypted: string;
  argon2_salt: string;
  argon2_params: Argon2Params;
  key_version: number;
}

export type VaultSharingMode = 'private' | 'shared';
export type VaultEncryptionMode = 'standard' | 're-encrypted';

export interface MindMapListItem {
  id: string;
  title_encrypted: string;
  vault_color?: string;
  vault_note_encrypted?: string;
  vault_sharing_mode?: VaultSharingMode;
  vault_encryption_mode?: VaultEncryptionMode;
  max_versions?: number;
  vault_labels?: string[];
  created_at: string;
  updated_at: string;
}

export interface MindMapDetail {
  id: string;
  title_encrypted: string;
  eph_classical_public: string;
  eph_pq_ciphertext: string;
  wrapped_dek: string;
  vault_color?: string;
  vault_note_encrypted?: string;
  vault_sharing_mode?: VaultSharingMode;
  vault_encryption_mode?: VaultEncryptionMode;
  max_versions?: number;
  total_version_count?: number;
  minio_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MindMapCreatedResponse {
  id: string;
  minio_object_key: string;
  upload_url: string;
}

export interface PresignedUrlResponse {
  url: string;
  expires_in_secs: number;
  version_id?: string;
}

export interface VersionDetail {
  version_id: string;
  version_number?: number;
  is_latest: boolean;
  last_modified: string;
  size_bytes: number;
  /** Present for all versions saved after history tracking was introduced. */
  eph_classical_public?: string;
  eph_pq_ciphertext?: string;
  wrapped_dek?: string;
  saved_at?: string;
}

export interface VaultStorageInfo {
  id: string;
  title_encrypted: string;
  version_count: number;
  attachment_count?: number;
  attachment_bytes?: number;
  total_bytes: number;
}

export interface StorageSummary {
  vaults: VaultStorageInfo[];
  total_bytes: number;
  attachment_count?: number;
  attachment_bytes?: number;
  free_tier_bytes: number;
}

export interface UserAccountSettings {
  locale: string;
  timezone: string;
  date_format: 'iso' | 'us' | 'eu' | string;
  accessibility_reduce_motion: boolean;
  sync_appearance_across_devices: boolean;
  default_share_expiry_days: number;
  default_include_attachments_on_share: boolean;
  default_map_layout: 'mindmap' | 'tree' | 'outline' | 'kanban' | string;
  default_map_theme: 'system' | 'light' | 'dark' | 'focus' | string;
  default_export_format: 'cryptmind' | 'json' | 'markdown' | 'png' | string;
  default_node_style_preset: string;
  user_labels_json?: string;
  updated_at: string;
}

export interface UpdateUserAccountSettingsRequest {
  locale?: string;
  timezone?: string;
  date_format?: string;
  accessibility_reduce_motion?: boolean;
  sync_appearance_across_devices?: boolean;
  default_share_expiry_days?: number;
  default_include_attachments_on_share?: boolean;
  default_map_layout?: string;
  default_map_theme?: string;
  default_export_format?: string;
  default_node_style_preset?: string;
  user_labels_json?: string;
}

export interface UserNotificationSettings {
  inbox_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  desktop_enabled: boolean;
  digest_enabled: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  allow_preview_local_only: boolean;
  share_created: boolean;
  share_revoked: boolean;
  attachment_upload_failures: boolean;
  security_alerts: boolean;
  admin_messages: boolean;
  collaboration_mentions: boolean;
  updated_at: string;
}

export interface UpdateUserNotificationSettingsRequest {
  inbox_enabled?: boolean;
  email_enabled?: boolean;
  push_enabled?: boolean;
  desktop_enabled?: boolean;
  digest_enabled?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  allow_preview_local_only?: boolean;
  share_created?: boolean;
  share_revoked?: boolean;
  attachment_upload_failures?: boolean;
  security_alerts?: boolean;
  admin_messages?: boolean;
  collaboration_mentions?: boolean;
}

export interface NotificationEvent {
  id: string;
  event_type: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | string;
  actor_user_id?: string;
  object_type: string;
  object_id: string;
  object_label_safe?: string;
  reason_code: string;
  payload_json: Record<string, unknown>;
  created_at: string;
  unread: boolean;
  saved: boolean;
  done: boolean;
  read_at?: string | null;
  saved_at?: string | null;
  done_at?: string | null;
}

export type AttachmentStatus = 'pending' | 'available' | 'deleted';

export interface InitAttachmentResponse {
  attachment_id: string;
  s3_key: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_at: string;
}

export interface AttachmentMetadata {
  id: string;
  map_id: string;
  node_id?: string;
  name: string;
  sanitized_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
  encrypted: boolean;
  encryption_meta?: Record<string, unknown> | null;
  checksum_sha256?: string | null;
  s3_version_id?: string | null;
  status: AttachmentStatus;
}

export interface AttachmentDownloadResponse {
  download_url: string;
  expires_at: string;
  encrypted: boolean;
  encryption_meta?: Record<string, unknown> | null;
  version_id?: string | null;
  content_type: string;
  name: string;
  sanitized_name: string;
  size_bytes: number;
  checksum_sha256?: string | null;
}

export type ShareScope = 'map' | 'node' | 'note';
export type ShareStatus = 'pending' | 'available' | 'revoked';

export interface CreateMapShareResponse {
  share_id: string;
  share_url: string;
  s3_key: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_at: string;
}

export interface MapShareOwnerSummary {
  id: string;
  map_id: string;
  name: string;
  scope: ShareScope;
  share_url: string;
  include_attachments: boolean;
  passphrase_hint?: string | null;
  expires_at?: string | null;
  revoked: boolean;
  created_at: string;
  updated_at: string;
  status: ShareStatus;
  content_type: string;
  size_bytes: number;
  checksum_sha256?: string | null;
}

export interface InitMapShareAttachmentResponse {
  attachment_id: string;
  s3_key: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_at: string;
}

export interface PublicMapShareAttachmentMetadata {
  id: string;
  share_id: string;
  node_id?: string;
  name: string;
  sanitized_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  encryption_meta: Record<string, unknown>;
  checksum_sha256?: string | null;
}

export interface PublicMapShareResponse {
  id: string;
  name: string;
  scope: ShareScope;
  include_attachments: boolean;
  passphrase_hint?: string | null;
  created_at: string;
  expires_at?: string | null;
  content_type: string;
  size_bytes: number;
  encryption_meta: Record<string, unknown>;
  checksum_sha256?: string | null;
  download_url: string;
  download_expires_at: string;
  attachments: PublicMapShareAttachmentMetadata[];
}

export interface MapShareAttachmentDownloadResponse {
  download_url: string;
  expires_at: string;
  content_type: string;
  name: string;
  sanitized_name: string;
  size_bytes: number;
  encryption_meta: Record<string, unknown>;
  version_id?: string | null;
  checksum_sha256?: string | null;
}

export interface UpdateVaultMetaRequest {
  vault_color?: string;
  vault_note_encrypted?: string;
  vault_sharing_mode?: VaultSharingMode;
  vault_encryption_mode?: VaultEncryptionMode;
  max_versions?: number;
  vault_labels?: string[];
  /** Re-encrypted title — only sent on rename. */
  title_encrypted?: string;
}

export interface UpsertMindMapRequest {
  title_encrypted: string;
  eph_classical_public: string;
  eph_pq_ciphertext: string;
  wrapped_dek: string;
}

// ── In-memory session state — NEVER persisted to disk ────────────────────────

export interface SessionKeys {
  masterKey: Uint8Array;
  classicalPrivKey: Uint8Array;
  classicalPubKey: Uint8Array;
  pqPrivKey: Uint8Array;
  pqPubKey: Uint8Array;
}

// ── Mind map graph (stored encrypted in MinIO) ────────────────────────────────

export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { label: string };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

export interface MindMapGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ── SVG tree mind map (new format, stored encrypted in MinIO) ─────────────────

export interface UrlEntry {
  url: string;
  label: string;
}

export interface NodeAttachmentRef {
  attachment_id: string;
  preview_attachment_id?: string | null;
  name: string;
  content_type: string;
  size_bytes: number;
  preview_content_type?: string | null;
  preview_kind?: 'image' | 'card';
  uploaded_at: string;
  /** Local-mode inline payload (base64) for standalone FOSS attachments. */
  inline_data_base64?: string;
  /** Optional local-mode preview payload (base64). */
  inline_preview_data_base64?: string;
}

export interface MindMapTreeNode {
  id: string;
  text: string;
  notes?: string;
  collapsed?: boolean;
  color?: string | null;
  link?: { type: string; id: string } | null;
  children: MindMapTreeNode[];
  /** Lucide icon names rendered inside the node (multi-select). */
  icons?: string[];
  /** null = no checkbox, false = unchecked, true = checked. */
  checked?: boolean | null;
  /** Manual progress percentage: 0 | 25 | 50 | 75 | 100 | null. */
  progress?: number | null;
  /** ISO datetime-local for start-date planning. */
  startDate?: string | null;
  /** ISO datetime-local for end-date planning. */
  endDate?: string | null;
  /** Custom URL links rendered as footer strips. */
  urls?: UrlEntry[];
  /** Encrypted attachment references stored inside the encrypted tree payload. */
  attachments?: NodeAttachmentRef[];
  /** Only meaningful for root's direct children: 'left' or 'right'. */
  side?: 'left' | 'right';
  /** Free-drag position override (layout skips normal calculation). */
  customX?: number;
  /** Free-drag position override (layout skips normal calculation). */
  customY?: number;
  /** User-defined tags on this node (e.g. ['work', 'urgent']). */
  tags?: string[];
}

export interface MindMapTree {
  version: 'tree';
  root: MindMapTreeNode;
  view_state?: {
    pan_x?: number;
    pan_y?: number;
    zoom?: number;
    focus_mode?: boolean;
    focus_anchor_id?: string | null;
    selected_node_id?: string;
  };
}

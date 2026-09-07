import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import encryptedVaultApi from '../api/encryptedVault';
import { mindmapsApi } from '../api/mindmaps';
import { DesktopMindMapEditor } from '../components/MindMapEditor';
import { UnlockModal } from '../components/UnlockModal';
import type { LinkableVault } from '../components/MindMapVaultLinkDialog';
import {
  decryptAttachmentForOwner,
  encryptAttachmentForOwner,
} from '../crypto/encryptedVault';
import { hybridDecap, hybridEncap } from '../crypto/kem';
import { decryptTitle, decryptTree, encryptTitle, encryptTree } from '../crypto/vault';
import { getStorage } from '../storage';
import { fromBase64, toBase64 } from '../crypto/utils';
import { useAuthStore } from '../store/auth';
import { useModeStore } from '../store/mode';
import type { AttachmentMetadata, MindMapTree, NodeAttachmentRef, VersionDetail } from '../types';
import { getPlanErrorPrompt, type PlanErrorPrompt } from '../utils/planErrors';
import { createEncryptedFilePreview } from '../utils/filePreview';
import { downloadBlob } from '../utils/download';
import { buildExportFileBaseName as buildExportName } from '../utils/exportFileName';
import { EXPORT_FORMATS, type ExportFormat } from '../utils/exportFormats';
import {
  createCloudTreeVaultPreview,
  isVaultPreviewAttachmentMeta,
  saveTreeVaultPreview,
} from '../utils/vaultPreview';

function mergeAttachmentRefs(
  inlineAttachments: NodeAttachmentRef[] | undefined,
  externalAttachments: NodeAttachmentRef[] | undefined,
): NodeAttachmentRef[] {
  const merged = new Map<string, NodeAttachmentRef>();
  for (const attachment of externalAttachments ?? []) {
    merged.set(attachment.attachment_id, attachment);
  }
  for (const attachment of inlineAttachments ?? []) {
    merged.set(attachment.attachment_id, {
      ...merged.get(attachment.attachment_id),
      ...attachment,
    });
  }
  return Array.from(merged.values()).sort((left, right) => right.uploaded_at.localeCompare(left.uploaded_at));
}

function attachmentRefsEqual(left: NodeAttachmentRef[] | undefined, right: NodeAttachmentRef[] | undefined): boolean {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((attachment, index) => {
    const candidate = normalizedRight[index];
    return candidate
      && candidate.attachment_id === attachment.attachment_id
      && candidate.preview_attachment_id === attachment.preview_attachment_id
      && candidate.name === attachment.name
      && candidate.content_type === attachment.content_type
      && candidate.size_bytes === attachment.size_bytes
      && candidate.preview_content_type === attachment.preview_content_type
      && candidate.preview_kind === attachment.preview_kind
      && candidate.uploaded_at === attachment.uploaded_at;
  });
}

function syncTreeAttachmentRefs(
  tree: MindMapTree,
  attachmentMap: Record<string, NodeAttachmentRef[]>,
): { tree: MindMapTree; changed: boolean } {
  let changed = false;

  const visit = (node: MindMapTree['root']): MindMapTree['root'] => {
    const mergedAttachments = mergeAttachmentRefs(node.attachments, attachmentMap[node.id]);
    const nextChildren = node.children.map(visit);
    const childChanged = nextChildren.some((child, index) => child !== node.children[index]);
    const currentAttachments = node.attachments ?? [];
    const attachmentsChanged = !attachmentRefsEqual(currentAttachments, mergedAttachments);

    if (!childChanged && !attachmentsChanged) {
      return node;
    }

    changed = true;
    return {
      ...node,
      attachments: mergedAttachments,
      children: childChanged ? nextChildren : node.children,
    };
  };

  const nextRoot = visit(tree.root);
  if (!changed) return { tree, changed: false };
  return {
    tree: {
      ...tree,
      root: nextRoot,
    },
    changed: true,
  };
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { sessionKeys } = useAuthStore();
  const mode = useModeStore((s) => s.mode);
  const isLocalMode = mode === 'local';
  const storage = useMemo(() => getStorage(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [planPrompt, setPlanPrompt] = useState<PlanErrorPrompt | null>(null);

  const [title, setTitle] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [initialTree, setInitialTree] = useState<MindMapTree | null>(null);
  const [currentTree, setCurrentTree] = useState<MindMapTree | null>(null);

  const [allAttachments, setAllAttachments] = useState<AttachmentMetadata[]>([]);
  const [versionLabel, setVersionLabel] = useState('');
  const [versionTooltip, setVersionTooltip] = useState('');
  const previewBlobUrlCacheRef = useRef<Record<string, string>>({});

  /**
   * The vaults a node can link to. Fetched only when the picker asks for
   * them — every title in the list costs a decryption, and titles are
   * encrypted at rest, so this is the only place that can produce them.
   */
  const [linkableVaults, setLinkableVaults] = useState<LinkableVault[]>([]);
  const [linkableVaultsLoading, setLinkableVaultsLoading] = useState(false);

  const loadLinkableVaults = useCallback(async () => {
    if (!sessionKeys) return;
    setLinkableVaultsLoading(true);
    try {
      const items = await storage.listVaults();
      const titles = await Promise.all(
        items.map(async (m) => {
          try {
            return await decryptTitle(m.title_encrypted, sessionKeys.masterKey);
          } catch {
            // A vault this account cannot read is still a vault; it just has
            // no name to show, and linking to it would be a link to nothing.
            return null;
          }
        }),
      );
      setLinkableVaults(
        items
          .map((m, i) => ({ id: m.id, title: titles[i] ?? '' }))
          .filter((v) => v.title !== '')
          .sort((a, b) => a.title.localeCompare(b.title)),
      );
    } catch {
      setLinkableVaults([]);
    } finally {
      setLinkableVaultsLoading(false);
    }
  }, [sessionKeys, storage]);

  const getVersionCountFromList = useCallback((versions: VersionDetail[], fallback = 0) => {
    const fromSequence = versions.reduce((max, version) => Math.max(max, version.version_number ?? 0), 0);
    return Math.max(fallback, fromSequence, versions.length);
  }, []);

  const isPreviewAttachment = useCallback((attachment: AttachmentMetadata) => {
    return attachment.encryption_meta?.cryptmind_role === 'preview';
  }, []);

  const isHiddenVaultPreviewAttachment = useCallback((attachment: AttachmentMetadata) => {
    return isVaultPreviewAttachmentMeta((attachment.encryption_meta ?? null) as Record<string, unknown> | null);
  }, []);

  const attachments = useMemo(
    () => allAttachments.filter((attachment) => !isPreviewAttachment(attachment) && !isHiddenVaultPreviewAttachment(attachment)),
    [allAttachments, isHiddenVaultPreviewAttachment, isPreviewAttachment],
  );

  const externalNodeAttachments = useMemo<Record<string, NodeAttachmentRef[]>>(() => {
    const previewByPrimary = new Map<string, AttachmentMetadata>();
    for (const attachment of allAttachments) {
      const meta = (attachment.encryption_meta ?? {}) as Record<string, unknown>;
      if (meta.cryptmind_role !== 'preview') continue;
      const primaryId = typeof meta.preview_of_attachment_id === 'string' ? meta.preview_of_attachment_id : null;
      if (primaryId) previewByPrimary.set(primaryId, attachment);
    }

    const mapped: Record<string, NodeAttachmentRef[]> = {};
    for (const attachment of attachments) {
      const nodeId = attachment.node_id ?? 'root';
      const preview = previewByPrimary.get(attachment.id);
      const previewMeta = (preview?.encryption_meta ?? {}) as Record<string, unknown>;
      const ref: NodeAttachmentRef = {
        attachment_id: attachment.id,
        preview_attachment_id: preview?.id ?? null,
        name: attachment.name,
        content_type: attachment.content_type,
        size_bytes: attachment.size_bytes,
        preview_content_type: preview?.content_type ?? null,
        preview_kind: previewMeta.preview_kind === 'image' || previewMeta.preview_kind === 'card' ? previewMeta.preview_kind : undefined,
        uploaded_at: attachment.uploaded_at,
      };
      mapped[nodeId] = [...(mapped[nodeId] ?? []), ref];
    }

    for (const [nodeId, refs] of Object.entries(mapped)) {
      refs.sort((left, right) => right.uploaded_at.localeCompare(left.uploaded_at));
      mapped[nodeId] = refs;
    }

    return mapped;
  }, [allAttachments, attachments]);

  const saveBytesToFile = useCallback((bytes: Uint8Array, fileName: string, contentType: string) => {
    const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([payload], { type: contentType });
    void downloadBlob(blob, fileName);
  }, []);

  const refreshSecureData = useCallback(async () => {
    if (!id || isLocalMode) return;
    setPlanPrompt(null);
    try {
      const nextAttachments = await encryptedVaultApi.listAttachments(id);
      setAllAttachments(nextAttachments);
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
    } finally {
    }
  }, [id, isLocalMode]);

  const syncVaultPreviewAttachments = useCallback(async (tree: MindMapTree) => {
    if (!id || !sessionKeys || isLocalMode) return;

    const previewThemes: Array<'dark' | 'light'> = ['dark', 'light'];
    const nextCreated: AttachmentMetadata[] = [];

    for (const theme of previewThemes) {
      const preview = await createCloudTreeVaultPreview(tree, theme);
      const encrypted = await encryptAttachmentForOwner(preview.bytes, sessionKeys.masterKey);
      const init = await encryptedVaultApi.initAttachment(id, {
        name: `__vault_preview_${theme}.webp`,
        content_type: preview.contentType,
        size: encrypted.ciphertext.byteLength,
        encrypted: true,
        encryption_meta: {
          ...encrypted.encryptionMeta,
          cryptmind_role: 'vault_preview',
          preview_theme: theme,
          node_count: preview.stats.nodeCount,
          note_count: preview.stats.noteCount,
          attachment_count: preview.stats.attachmentCount,
        },
      });
      const versionId = await encryptedVaultApi.uploadPresigned(init.upload_url, encrypted.ciphertext, {
        ...init.upload_headers,
        'Content-Type': preview.contentType,
      });
      const completed = await encryptedVaultApi.completeAttachment(id, init.attachment_id, versionId ?? '', encrypted.checksumSha256);
      nextCreated.push(completed);
    }

    const existingHiddenPreviews = allAttachments.filter(isHiddenVaultPreviewAttachment);
    for (const attachment of existingHiddenPreviews) {
      await encryptedVaultApi.deleteAttachment(id, attachment.id);
    }

    setAllAttachments((current) => {
      const preserved = current.filter((attachment) => !isHiddenVaultPreviewAttachment(attachment));
      return [...preserved, ...nextCreated];
    });
  }, [allAttachments, id, isHiddenVaultPreviewAttachment, isLocalMode, sessionKeys]);

  useEffect(() => {
    if (!id || !sessionKeys || isLocalMode) return;
    void refreshSecureData();
  }, [id, isLocalMode, refreshSecureData, sessionKeys]);

  useEffect(() => () => {
    Object.values(previewBlobUrlCacheRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!currentTree) return;
    const syncedCurrent = syncTreeAttachmentRefs(currentTree, externalNodeAttachments);
    if (syncedCurrent.changed) {
      setCurrentTree(syncedCurrent.tree);
    }
    if (!initialTree) return;
    const syncedInitial = syncTreeAttachmentRefs(initialTree, externalNodeAttachments);
    if (syncedInitial.changed) {
      setInitialTree(syncedInitial.tree);
    }
  }, [currentTree, externalNodeAttachments, initialTree]);


  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (specificVersionId?: string) => {
    if (!id || !sessionKeys) return;
    setLoading(true);
    setError('');
    setPlanPrompt(null);
    try {
      const detail = await storage.getVault(id);
      const plainTitle = await decryptTitle(detail.title_encrypted, sessionKeys.masterKey);
      setTitle(plainTitle);
      setSavedTitle(plainTitle);

      // Default: use the latest KEM envelope on the record.
      let kemFields = {
        eph_classical_public: detail.eph_classical_public,
        eph_pq_ciphertext: detail.eph_pq_ciphertext,
        wrapped_dek: detail.wrapped_dek,
      };

      // For a specific historical version, find its KEM snapshot.
      if (!isLocalMode && specificVersionId && specificVersionId !== detail.minio_version_id) {
        const versions = await mindmapsApi.listVersions(id);
        const snap = versions.find((v) => v.version_id === specificVersionId);
        if (snap?.eph_classical_public) {
          kemFields = {
            eph_classical_public: snap.eph_classical_public,
            eph_pq_ciphertext: snap.eph_pq_ciphertext!,
            wrapped_dek: snap.wrapped_dek!,
          };
        }
      }

      const dek = await hybridDecap(
        sessionKeys.classicalPrivKey,
        sessionKeys.pqPrivKey,
        fromBase64(kemFields.eph_classical_public),
        fromBase64(kemFields.eph_pq_ciphertext),
        fromBase64(kemFields.wrapped_dek),
      );

      const blob = !isLocalMode && specificVersionId
        ? await (async () => {
            return mindmapsApi.downloadBlob(id, specificVersionId);
          })()
        : await storage.downloadBlob(id);
      const tree = await decryptTree(blob, dek);
      saveTreeVaultPreview(id, detail.updated_at, tree);
      setInitialTree(tree);
      setCurrentTree(tree);
      const vdt = new Date(detail.updated_at);
      setVersionTooltip(vdt.toLocaleString());
      // Fetch version list to show vN numbering in toolbar
      if (!isLocalMode) {
        void mindmapsApi.listVersions(id).then((versions) => {
          const total = getVersionCountFromList(versions, detail.total_version_count ?? 0);
          if (!specificVersionId || specificVersionId === detail.minio_version_id) {
            setVersionLabel(`v${total}`);
          } else {
            const selectedVersion = versions.find((version) => version.version_id === specificVersionId);
            setVersionLabel(`v${selectedVersion?.version_number ?? total}`);
          }
        }).catch(() => {
          setVersionLabel(`v ${vdt.toLocaleDateString()}`);
        });
      } else {
        setVersionLabel(`v ${vdt.toLocaleDateString()}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, [getVersionCountFromList, id, sessionKeys, isLocalMode, storage]);

  useEffect(() => {
    if (sessionKeys) load(searchParams.get('version_id') ?? undefined);
    else setLoading(false);
  }, [sessionKeys, load]); // searchParams intentionally omitted — only used on first mount

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (tree: MindMapTree, currentTitle: string) => {
    if (!id || !sessionKeys) return;
    setSaving(true);
    setError('');
    setSaveMsg('');
    setPlanPrompt(null);
    try {
      const effectiveTitle = currentTitle || title;
      const titleEnc = await encryptTitle(effectiveTitle, sessionKeys.masterKey);
      const { ephClassicalPublic, ephPqCiphertext, wrappedDek, dek } = await hybridEncap(
        sessionKeys.classicalPubKey,
        sessionKeys.pqPubKey,
      );
      const encBlob = await encryptTree(tree, dek);
      await storage.updateVault(id, {
        title_encrypted: titleEnc,
        eph_classical_public: toBase64(ephClassicalPublic),
        eph_pq_ciphertext: toBase64(ephPqCiphertext),
        wrapped_dek: toBase64(wrappedDek),
      });
      await storage.uploadBlob(id, encBlob);
      await syncVaultPreviewAttachments(tree);
      const refreshed = await storage.getVault(id);
      saveTreeVaultPreview(id, refreshed.updated_at, tree);
      const sdt = new Date(refreshed.updated_at);
      setVersionTooltip(sdt.toLocaleString());
      // Re-fetch version list to get updated vN count
      if (!isLocalMode) {
        void mindmapsApi.listVersions(id).then((versions) => {
          setVersionLabel(`v${getVersionCountFromList(versions)}`);
        }).catch(() => {
          setVersionLabel(`v ${sdt.toLocaleDateString()}`);
        });
      } else {
        setVersionLabel(`v ${sdt.toLocaleDateString()}`);
      }
      setTitle(effectiveTitle);
      setSavedTitle(effectiveTitle);
      setCurrentTree(tree);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [getVersionCountFromList, id, sessionKeys, storage, syncVaultPreviewAttachments, title]);
  // ── Rename (title only, no new blob version) ─────────────────────────────────────────
  const handleRenameTitle = useCallback(async () => {
    if (!id || !sessionKeys || !title.trim()) return;
    setRenamingTitle(true);
    setError('');
    try {
      const titleEnc = await encryptTitle(title.trim(), sessionKeys.masterKey);
      await storage.updateMeta(id, { title_encrypted: titleEnc });
      setSavedTitle(title.trim());
      setSaveMsg('Renamed');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setRenamingTitle(false);
    }
  }, [id, sessionKeys, storage, title]);

  const buildExportFileBaseName = useCallback(
    (baseTitle?: string) =>
      buildExportName({ baseTitle, title, fallback: 'vault', versionLabel }),
    [title, versionLabel],
  );

  // ── Export ───────────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async (format: ExportFormat, tree: MindMapTree, baseName: string) => {
    const blob = await format.serialize(tree.root, baseName);
    void downloadBlob(blob, `${buildExportFileBaseName(baseName)}${format.extension}`);
  }, [buildExportFileBaseName]);

  const uploadEncryptedNodeFiles = useCallback(async (nodeId: string, files: File[]): Promise<NodeAttachmentRef[]> => {
    if (!id || !sessionKeys) return [];

    if (isLocalMode) {
      const created: NodeAttachmentRef[] = [];
      setPlanPrompt(null);
      try {
        for (const file of files) {
          const plaintext = new Uint8Array(await file.arrayBuffer());
          const preview = await createEncryptedFilePreview(file);
          created.push({
            attachment_id: `local-${crypto.randomUUID()}`,
            preview_attachment_id: null,
            name: file.name,
            content_type: file.type || 'application/octet-stream',
            size_bytes: file.size,
            preview_content_type: preview.contentType,
            preview_kind: preview.kind,
            uploaded_at: new Date().toISOString(),
            inline_data_base64: toBase64(plaintext),
            inline_preview_data_base64: toBase64(preview.bytes),
          });
        }

        setSaveMsg(`${files.length} local attachment${files.length === 1 ? '' : 's'} added`);
        setTimeout(() => setSaveMsg(''), 3000);
        return created;
      } catch (err) {
        return [];
      } finally {
      }
    }

    const created: NodeAttachmentRef[] = [];
    setPlanPrompt(null);

    try {
      for (const file of files) {
        const plaintext = new Uint8Array(await file.arrayBuffer());
        const encrypted = await encryptAttachmentForOwner(plaintext, sessionKeys.masterKey);
        const init = await encryptedVaultApi.initAttachment(id, {
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          size: encrypted.ciphertext.byteLength,
          node_id: nodeId,
          encrypted: true,
          encryption_meta: {
            ...encrypted.encryptionMeta,
            cryptmind_role: 'primary',
          },
        });
        const versionId = await encryptedVaultApi.uploadPresigned(init.upload_url, encrypted.ciphertext, {
          ...init.upload_headers,
          'Content-Type': file.type || 'application/octet-stream',
        });
        await encryptedVaultApi.completeAttachment(id, init.attachment_id, versionId ?? '', encrypted.checksumSha256);

        const preview = await createEncryptedFilePreview(file);
        const encryptedPreview = await encryptAttachmentForOwner(preview.bytes, sessionKeys.masterKey);
        const previewName = `${file.name}.preview`;
        const previewInit = await encryptedVaultApi.initAttachment(id, {
          name: previewName,
          content_type: preview.contentType,
          size: encryptedPreview.ciphertext.byteLength,
          node_id: nodeId,
          encrypted: true,
          encryption_meta: {
            ...encryptedPreview.encryptionMeta,
            cryptmind_role: 'preview',
            preview_of_attachment_id: init.attachment_id,
            preview_kind: preview.kind,
          },
        });
        const previewVersionId = await encryptedVaultApi.uploadPresigned(previewInit.upload_url, encryptedPreview.ciphertext, {
          ...previewInit.upload_headers,
          'Content-Type': preview.contentType,
        });
        await encryptedVaultApi.completeAttachment(id, previewInit.attachment_id, previewVersionId ?? '', encryptedPreview.checksumSha256);

        created.push({
          attachment_id: init.attachment_id,
          preview_attachment_id: previewInit.attachment_id,
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          preview_content_type: preview.contentType,
          preview_kind: preview.kind,
          uploaded_at: new Date().toISOString(),
        });
      }

      await refreshSecureData();
      setSaveMsg(`${files.length} node attachment${files.length === 1 ? '' : 's'} uploaded`);
      setTimeout(() => setSaveMsg(''), 3000);
      return created;
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
      return [];
    } finally {
    }
  }, [id, isLocalMode, refreshSecureData, sessionKeys]);


  const handleOpenNodeAttachment = useCallback(async (attachment: NodeAttachmentRef) => {
    if (!id || !sessionKeys) return;

    if (isLocalMode) {
      if (!attachment.inline_data_base64) {
        return;
      }
      const bytes = fromBase64(attachment.inline_data_base64);
      saveBytesToFile(bytes, attachment.name, attachment.content_type || 'application/octet-stream');
      return;
    }

    try {
      const download = await encryptedVaultApi.getAttachmentDownload(id, attachment.attachment_id);
      const bytes = await encryptedVaultApi.downloadUrl(download.download_url);
      const plaintext = download.encrypted
        ? await decryptAttachmentForOwner(bytes, download.encryption_meta, sessionKeys.masterKey)
        : bytes;
      saveBytesToFile(plaintext, download.name, download.content_type || attachment.content_type || 'application/octet-stream');
    } catch (err) {
    }
  }, [id, isLocalMode, saveBytesToFile, sessionKeys]);

  const handleFetchNodeAttachmentContent = useCallback(async (attachment: NodeAttachmentRef): Promise<{ name: string; contentType: string; blob: Blob } | null> => {
    if (!id || !sessionKeys) return null;

    if (isLocalMode) {
      if (!attachment.inline_data_base64) return null;
      const bytes = fromBase64(attachment.inline_data_base64);
      const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const contentType = attachment.content_type || 'application/octet-stream';
      return {
        name: attachment.name,
        contentType,
        blob: new Blob([payload], { type: contentType }),
      };
    }

    try {
      const download = await encryptedVaultApi.getAttachmentDownload(id, attachment.attachment_id);
      const bytes = await encryptedVaultApi.downloadUrl(download.download_url);
      const plaintext = download.encrypted
        ? await decryptAttachmentForOwner(bytes, download.encryption_meta, sessionKeys.masterKey)
        : bytes;
      const payload = plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer;
      const contentType = download.content_type || attachment.content_type || 'application/octet-stream';
      return {
        name: download.name || attachment.name,
        contentType,
        blob: new Blob([payload], { type: contentType }),
      };
    } catch (err) {
      return null;
    }
  }, [id, isLocalMode, sessionKeys]);

  const handleLoadNodeAttachmentPreview = useCallback(async (attachment: NodeAttachmentRef): Promise<string | null> => {
    if (!id || !sessionKeys) return null;

    if (isLocalMode) {
      const isImageAttachment = (attachment.content_type ?? '').startsWith('image/');
      const previewSourceId = attachment.attachment_id;
      const cached = previewBlobUrlCacheRef.current[previewSourceId];
      if (cached) return cached;

      const payloadBase64 = isImageAttachment
        ? attachment.inline_data_base64
        : attachment.inline_preview_data_base64;
      if (!payloadBase64) return null;

      const bytes = fromBase64(payloadBase64);
      const payload = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([payload], {
        type: isImageAttachment
          ? (attachment.content_type || 'image/png')
          : (attachment.preview_content_type || 'image/svg+xml'),
      });
      const previewUrl = URL.createObjectURL(blob);
      previewBlobUrlCacheRef.current[previewSourceId] = previewUrl;
      return previewUrl;
    }

    const isImageAttachment = (attachment.content_type ?? '').startsWith('image/');
    const previewSourceId = isImageAttachment ? attachment.attachment_id : attachment.preview_attachment_id;
    if (!previewSourceId) return null;

    const cached = previewBlobUrlCacheRef.current[previewSourceId];
    if (cached) return cached;

    try {
      const download = await encryptedVaultApi.getAttachmentDownload(id, previewSourceId);
      const bytes = await encryptedVaultApi.downloadUrl(download.download_url);
      const plaintext = download.encrypted
        ? await decryptAttachmentForOwner(bytes, download.encryption_meta, sessionKeys.masterKey)
        : bytes;
      const payload = plaintext.buffer.slice(
        plaintext.byteOffset,
        plaintext.byteOffset + plaintext.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([payload], {
        type: download.content_type || attachment.content_type || attachment.preview_content_type || 'image/svg+xml',
      });
      const previewUrl = URL.createObjectURL(blob);
      previewBlobUrlCacheRef.current[previewSourceId] = previewUrl;
      return previewUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load node attachment preview';
      if (!/\b404\b|attachment not found/i.test(message)) {
      }
      return null;
    }
  }, [id, isLocalMode, sessionKeys]);

  const handleDeleteNodeAttachment = useCallback(async (attachment: NodeAttachmentRef) => {
    if (!id) return;

    if (isLocalMode) {
      const cacheKey = attachment.attachment_id;
      const cachedPreviewUrl = previewBlobUrlCacheRef.current[cacheKey];
      if (cachedPreviewUrl) {
        URL.revokeObjectURL(cachedPreviewUrl);
        delete previewBlobUrlCacheRef.current[cacheKey];
      }
      return;
    }

    try {
      const previewCacheKeys = [attachment.attachment_id, attachment.preview_attachment_id].filter((value): value is string => Boolean(value));
      for (const cacheKey of previewCacheKeys) {
        const cachedPreviewUrl = previewBlobUrlCacheRef.current[cacheKey];
        if (cachedPreviewUrl) {
          URL.revokeObjectURL(cachedPreviewUrl);
          delete previewBlobUrlCacheRef.current[cacheKey];
        }
      }
      if (attachment.preview_attachment_id) {
        await encryptedVaultApi.deleteAttachment(id, attachment.preview_attachment_id);
      }
      await encryptedVaultApi.deleteAttachment(id, attachment.attachment_id);
      await refreshSecureData();
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
    }
  }, [id, isLocalMode, refreshSecureData]);

  // ── Unlock prompt ───────────────────────────────────────────────────────────
  if (!sessionKeys) {
    return <UnlockModal onUnlocked={() => load(searchParams.get('version_id') ?? undefined)} />;
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Decrypting vault…
      </div>
    );
  }

  // ── Editor ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {planPrompt && !isLocalMode && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-50">{planPrompt.title}</p>
              <p className="mt-1 text-amber-100/90">{planPrompt.message}</p>
            </div>
          </div>
        </div>
      )}
      <DesktopMindMapEditor
        vaultId={id}
        linkableVaults={linkableVaults}
        linkableVaultsLoading={linkableVaultsLoading}
        onRequestLinkableVaults={() => { void loadLinkableVaults(); }}
        onOpenVaultLink={(linkedId) => navigate(`/vaults/${linkedId}`)}
        initialTree={initialTree}
        externalNodeAttachments={externalNodeAttachments}
        title={title}
        onTitleChange={setTitle}
        onSave={handleSave}
        saving={saving}
        saveMsg={saveMsg}
        error={error}
        titleChanged={title.trim() !== savedTitle}
        onRenameTitle={() => void handleRenameTitle()}
        renamingTitle={renamingTitle}
        onBack={() => navigate('/vaults')}
        exportFormats={EXPORT_FORMATS}
        onExport={handleExport}
        versionLabel={versionLabel}
        versionTooltip={versionTooltip}
        onTreeChange={setCurrentTree}
        onNodeFileDrop={(nodeId, files) => uploadEncryptedNodeFiles(nodeId, files)}
        onOpenNodeAttachment={(attachment) => { void handleOpenNodeAttachment(attachment); }}
        onFetchNodeAttachmentContent={(attachment) => handleFetchNodeAttachmentContent(attachment)}
        onDeleteNodeAttachment={(attachment) => { void handleDeleteNodeAttachment(attachment); }}
        onLoadNodeAttachmentPreview={(attachment) => handleLoadNodeAttachmentPreview(attachment)}
      />
    </div>
  );
}

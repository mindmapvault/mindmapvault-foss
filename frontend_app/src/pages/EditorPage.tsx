import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import encryptedVaultApi from '../api/encryptedVault';
import { mindmapsApi } from '../api/mindmaps';
import EncryptedVaultDialog, { type SecureVaultTab } from '../components/EncryptedVaultDialog';
import { DesktopMindMapEditor } from '../components/MindMapEditor';
import { flattenAll } from '../components/MindMapHelpers';
import { VersionHistoryPanel } from '../components/VersionHistoryPanel';
import { UnlockModal } from '../components/UnlockModal';
import {
  createEncryptedShareBundle,
  decryptAttachmentForOwner,
  encryptAttachmentForOwner,
  encryptBytesForShare,
} from '../crypto/encryptedVault';
import { hybridDecap, hybridEncap } from '../crypto/kem';
import { decryptTitle, decryptTree, encryptTitle, encryptTree } from '../crypto/vault';
import { getStorage } from '../storage';
import { fromBase64, toBase64 } from '../crypto/utils';
import { useAuthStore } from '../store/auth';
import { useModeStore } from '../store/mode';
import type { AttachmentMetadata, MapShareOwnerSummary, MindMapTree, NodeAttachmentRef, VersionDetail } from '../types';
import { getPlanErrorPrompt, type PlanErrorPrompt } from '../utils/planErrors';
import { createEncryptedFilePreview } from '../utils/filePreview';
import { treeToMarkdown } from '../utils/markdownExport';
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('root');

  const [showHistory, setShowHistory] = useState(false);
  const [loadingVersionId, setLoadingVersionId] = useState<string | null>(null);
  const [secureDialogOpen, setSecureDialogOpen] = useState(false);
  const [secureDialogTab, setSecureDialogTab] = useState<SecureVaultTab>('attachments');
  const [allAttachments, setAllAttachments] = useState<AttachmentMetadata[]>([]);
  const [shares, setShares] = useState<MapShareOwnerSummary[]>([]);
  const [secureLoading, setSecureLoading] = useState(false);
  const [secureError, setSecureError] = useState<string | null>(null);
  const [attachmentUpload, setAttachmentUpload] = useState<{ busy: boolean; label?: string }>({ busy: false });
  const [shareBusy, setShareBusy] = useState(false);
  // Increment to force editor remount when a historical version is loaded
  const [editorKey, setEditorKey] = useState(0);
  const [versionLabel, setVersionLabel] = useState('');
  const [versionTooltip, setVersionTooltip] = useState('');
  const previewBlobUrlCacheRef = useRef<Record<string, string>>({});

  const getVersionCountFromList = useCallback((versions: VersionDetail[], fallback = 0) => {
    const fromSequence = versions.reduce((max, version) => Math.max(max, version.version_number ?? 0), 0);
    return Math.max(fallback, fromSequence, versions.length);
  }, []);

  const nodeOptions = useMemo(
    () => (currentTree ? flattenAll(currentTree.root).filter((node) => node.id !== 'root').map((node) => ({ id: node.id, label: node.text.trim() || 'Untitled node' })) : []),
    [currentTree],
  );

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
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const refreshSecureData = useCallback(async () => {
    if (!id || isLocalMode) return;
    setSecureLoading(true);
    setSecureError(null);
    setPlanPrompt(null);
    try {
      const [nextAttachments, nextShares] = await Promise.all([
        encryptedVaultApi.listAttachments(id),
        encryptedVaultApi.listShares(id),
      ]);
      setAllAttachments(nextAttachments);
      setShares(nextShares);
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
      setSecureError(err instanceof Error ? err.message : 'Failed to load encrypted vault data');
    } finally {
      setSecureLoading(false);
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

  const openSecurePanel = useCallback((tab: SecureVaultTab) => {
    if (isLocalMode) return;
    setSecureDialogTab(tab);
    setSecureDialogOpen(true);
    void refreshSecureData();
  }, [isLocalMode, refreshSecureData]);

  useEffect(() => {
    const requestedTab = searchParams.get('secure');
    if (!requestedTab || isLocalMode) {
      return;
    }
    if (requestedTab === 'shares' || requestedTab === 'attachments') {
      openSecurePanel(requestedTab);
    }
  }, [isLocalMode, openSecurePanel, searchParams]);

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
      setSelectedNodeId(tree.view_state?.selected_node_id ?? 'root');
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

  // ── Load a historical version in-place ─────────────────────────────────────────
  const loadVersion = useCallback(async (v: VersionDetail) => {
    if (!id || !sessionKeys || !v.eph_classical_public) return;
    setLoadingVersionId(v.version_id);
    setError('');
    try {
      const dek = await hybridDecap(
        sessionKeys.classicalPrivKey,
        sessionKeys.pqPrivKey,
        fromBase64(v.eph_classical_public),
        fromBase64(v.eph_pq_ciphertext!),
        fromBase64(v.wrapped_dek!),
      );
      const blob = await mindmapsApi.downloadBlob(id, v.version_id);
      const tree = await decryptTree(blob, dek);
      setInitialTree(tree);
      setCurrentTree(tree);
      setSelectedNodeId(tree.view_state?.selected_node_id ?? 'root');
      setEditorKey((k) => k + 1);
      setShowHistory(false);
      if (!v.is_latest) {
        setSaveMsg(`Loaded version from ${new Date(v.saved_at ?? v.last_modified).toLocaleString()}`);
        setTimeout(() => setSaveMsg(''), 5000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version');
    } finally {
      setLoadingVersionId(null);
    }
  }, [id, sessionKeys]);

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

  // ── Delete a specific version ──────────────────────────────────────────────────
  const handleDeleteVersion = useCallback(async (versionId: string) => {
    if (!id) return;
    await mindmapsApi.deleteVersion(id, versionId);
  }, [id]);

  const buildExportFileBaseName = useCallback((baseTitle?: string) => {
    const normalizedTitle = (baseTitle || title || 'vault').trim();
    const safeTitle = normalizedTitle
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const versionMatch = (versionLabel ?? '').match(/v\s*(\d+)/i);
    const versionToken = versionMatch ? `v${versionMatch[1]}` : null;
    return versionToken ? `${safeTitle}-${versionToken}` : safeTitle;
  }, [title, versionLabel]);

  // ── Export ───────────────────────────────────────────────────────────────────────

  const handleExportMarkdown = useCallback((tree: MindMapTree, currentTitle: string) => {
    const md = treeToMarkdown(tree.root, currentTitle);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${buildExportFileBaseName(currentTitle)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [buildExportFileBaseName]);

  const handleUploadFiles = useCallback(async (files: FileList) => {
    if (!id || !sessionKeys || isLocalMode) return;
    setAttachmentUpload({ busy: true, label: 'Encrypting files…' });
    setSecureError(null);
    setPlanPrompt(null);
    try {
      for (const file of Array.from(files)) {
        setAttachmentUpload({ busy: true, label: `Uploading ${file.name}…` });
        const plaintext = new Uint8Array(await file.arrayBuffer());
        const encrypted = await encryptAttachmentForOwner(plaintext, sessionKeys.masterKey);
        const init = await encryptedVaultApi.initAttachment(id, {
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          size: encrypted.ciphertext.byteLength,
          node_id: selectedNodeId && selectedNodeId !== 'root' ? selectedNodeId : undefined,
          encrypted: true,
          encryption_meta: encrypted.encryptionMeta,
        });
        const versionId = await encryptedVaultApi.uploadPresigned(init.upload_url, encrypted.ciphertext, {
          ...init.upload_headers,
          'Content-Type': file.type || 'application/octet-stream',
        });
        await encryptedVaultApi.completeAttachment(id, init.attachment_id, versionId ?? '', encrypted.checksumSha256);
      }
      await refreshSecureData();
      setSaveMsg(`${files.length} attachment${files.length === 1 ? '' : 's'} uploaded`);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
      setSecureError(err instanceof Error ? err.message : 'Failed to upload attachment');
    } finally {
      setAttachmentUpload({ busy: false });
    }
  }, [id, isLocalMode, refreshSecureData, selectedNodeId, sessionKeys]);

  const uploadEncryptedNodeFiles = useCallback(async (nodeId: string, files: File[]): Promise<NodeAttachmentRef[]> => {
    if (!id || !sessionKeys) return [];

    if (isLocalMode) {
      const created: NodeAttachmentRef[] = [];
      setAttachmentUpload({ busy: true, label: 'Preparing local attachments…' });
      setSecureError(null);
      setPlanPrompt(null);
      try {
        for (const file of files) {
          setAttachmentUpload({ busy: true, label: `Adding ${file.name}…` });
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
        setSecureError(err instanceof Error ? err.message : 'Failed to prepare local node attachment');
        return [];
      } finally {
        setAttachmentUpload({ busy: false });
      }
    }

    const created: NodeAttachmentRef[] = [];
    setAttachmentUpload({ busy: true, label: 'Encrypting file previews…' });
    setSecureError(null);
    setPlanPrompt(null);

    try {
      for (const file of files) {
        setAttachmentUpload({ busy: true, label: `Uploading ${file.name}…` });
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
      setSecureError(err instanceof Error ? err.message : 'Failed to upload node attachment');
      return [];
    } finally {
      setAttachmentUpload({ busy: false });
    }
  }, [id, isLocalMode, refreshSecureData, sessionKeys]);

  const handleDownloadAttachment = useCallback(async (attachment: AttachmentMetadata) => {
    if (!id || !sessionKeys || isLocalMode) return;
    setSecureError(null);
    try {
      const download = await encryptedVaultApi.getAttachmentDownload(id, attachment.id);
      const bytes = await encryptedVaultApi.downloadUrl(download.download_url);
      const plaintext = download.encrypted
        ? await decryptAttachmentForOwner(bytes, download.encryption_meta, sessionKeys.masterKey)
        : bytes;
      saveBytesToFile(plaintext, download.name, download.content_type || 'application/octet-stream');
    } catch (err) {
      setSecureError(err instanceof Error ? err.message : 'Failed to download attachment');
    }
  }, [id, isLocalMode, saveBytesToFile, sessionKeys]);

  const handleDeleteAttachment = useCallback(async (attachment: AttachmentMetadata) => {
    if (!id || isLocalMode) return;
    setSecureError(null);
    try {
      const previewAttachmentIds = currentTree
        ? flattenAll(currentTree.root)
          .flatMap((node) => node.attachments ?? [])
          .filter((item) => item.attachment_id === attachment.id && item.preview_attachment_id)
          .map((item) => item.preview_attachment_id!)
        : [];

      for (const previewAttachmentId of previewAttachmentIds) {
        await encryptedVaultApi.deleteAttachment(id, previewAttachmentId);
      }
      await encryptedVaultApi.deleteAttachment(id, attachment.id);
      await refreshSecureData();
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
      setSecureError(err instanceof Error ? err.message : 'Failed to delete attachment');
    }
  }, [currentTree, id, isLocalMode, refreshSecureData]);

  const handleAssignAttachmentNode = useCallback(async (attachment: AttachmentMetadata, nodeId?: string) => {
    if (!id || isLocalMode) return;
    setSecureError(null);
    try {
      await encryptedVaultApi.updateAttachmentNode(id, attachment.id, nodeId);
      setAllAttachments((current) => current.map((item) => (item.id === attachment.id ? { ...item, node_id: nodeId } : item)));
    } catch (err) {
      setSecureError(err instanceof Error ? err.message : 'Failed to update attachment node');
    }
  }, [id, isLocalMode]);

  const handleOpenNodeAttachment = useCallback(async (attachment: NodeAttachmentRef) => {
    if (!id || !sessionKeys) return;

    if (isLocalMode) {
      if (!attachment.inline_data_base64) {
        setSecureError('Local attachment payload is unavailable.');
        return;
      }
      const bytes = fromBase64(attachment.inline_data_base64);
      saveBytesToFile(bytes, attachment.name, attachment.content_type || 'application/octet-stream');
      return;
    }

    setSecureError(null);
    try {
      const download = await encryptedVaultApi.getAttachmentDownload(id, attachment.attachment_id);
      const bytes = await encryptedVaultApi.downloadUrl(download.download_url);
      const plaintext = download.encrypted
        ? await decryptAttachmentForOwner(bytes, download.encryption_meta, sessionKeys.masterKey)
        : bytes;
      saveBytesToFile(plaintext, download.name, download.content_type || attachment.content_type || 'application/octet-stream');
    } catch (err) {
      setSecureError(err instanceof Error ? err.message : 'Failed to download node attachment');
    }
  }, [id, isLocalMode, saveBytesToFile, sessionKeys]);

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
        setSecureError(message);
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

    setSecureError(null);
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
      setSecureError(err instanceof Error ? err.message : 'Failed to delete node attachment');
    }
  }, [id, isLocalMode, refreshSecureData]);

  const handleCopyShareUrl = useCallback(async (share: MapShareOwnerSummary) => {
    try {
      await navigator.clipboard.writeText(share.share_url);
      setSaveMsg('Share link copied');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch {
      setSecureError('Clipboard write failed. Copy the share URL manually from the share list.');
    }
  }, []);

  const handleRevokeShare = useCallback(async (share: MapShareOwnerSummary) => {
    if (!id || isLocalMode) return;
    setSecureError(null);
    try {
      await encryptedVaultApi.revokeShare(id, share.id);
      await refreshSecureData();
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
      setSecureError(err instanceof Error ? err.message : 'Failed to revoke share');
    }
  }, [id, isLocalMode, refreshSecureData]);

  const handleCreateShare = useCallback(async (draft: {
    name: string;
    passphrase: string;
    passphraseConfirm: string;
    passphraseHint: string;
    expiresInDays: string;
    includeAttachments: boolean;
  }) => {
    if (!id || !sessionKeys || isLocalMode || !currentTree) return;
    if (!draft.passphrase.trim()) {
      setSecureError('A share passphrase is required.');
      return;
    }
    if (draft.passphrase !== draft.passphraseConfirm) {
      setSecureError('The share passphrase confirmation does not match.');
      return;
    }

    setShareBusy(true);
    setSecureError(null);
    setPlanPrompt(null);
    try {
      const expiresInDays = Number.parseInt(draft.expiresInDays, 10);
      const expiresAt = Number.isFinite(expiresInDays) && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const shareBundle = await createEncryptedShareBundle({
        title: title.trim() || savedTitle || 'Untitled vault',
        tree: currentTree,
        exported_at: new Date().toISOString(),
        source_vault_id: id,
        include_attachments: draft.includeAttachments,
      }, draft.passphrase);

      const created = await encryptedVaultApi.createShare(id, {
        name: draft.name.trim() || `${title || 'vault'}.cmvshare`,
        scope: 'map',
        include_attachments: draft.includeAttachments,
        passphrase_hint: draft.passphraseHint.trim() || undefined,
        expires_at: expiresAt,
        content_type: 'application/vnd.cryptmind.share+json',
        size_bytes: shareBundle.ciphertext.byteLength,
        encryption_meta: shareBundle.encryptionMeta,
      });

      const shareVersionId = await encryptedVaultApi.uploadPresigned(created.upload_url, shareBundle.ciphertext, {
        ...created.upload_headers,
        'Content-Type': 'application/vnd.cryptmind.share+json',
      });
      await encryptedVaultApi.completeShareUpload(id, created.share_id, shareVersionId ?? '', shareBundle.checksumSha256);

      if (draft.includeAttachments) {
        const sourceAttachments = attachments.length > 0 ? attachments.filter((item) => item.status === 'available') : await encryptedVaultApi.listAttachments(id);
        for (const attachment of sourceAttachments) {
          const download = await encryptedVaultApi.getAttachmentDownload(id, attachment.id);
          const ciphertext = await encryptedVaultApi.downloadUrl(download.download_url);
          const plaintext = download.encrypted
            ? await decryptAttachmentForOwner(ciphertext, download.encryption_meta, sessionKeys.masterKey)
            : ciphertext;
          const encryptedAttachment = await encryptBytesForShare(plaintext, shareBundle.shareKey);
          const init = await encryptedVaultApi.initShareAttachment(id, created.share_id, {
            name: attachment.name,
            content_type: download.content_type || attachment.content_type || 'application/octet-stream',
            size: encryptedAttachment.ciphertext.byteLength,
            node_id: attachment.node_id,
            source_attachment_id: attachment.id,
            encryption_meta: shareBundle.encryptionMeta,
          });
          const attachmentVersionId = await encryptedVaultApi.uploadPresigned(init.upload_url, encryptedAttachment.ciphertext, {
            ...init.upload_headers,
            'Content-Type': download.content_type || attachment.content_type || 'application/octet-stream',
          });
          await encryptedVaultApi.completeShareAttachment(id, created.share_id, init.attachment_id, attachmentVersionId ?? '', encryptedAttachment.checksumSha256);
        }
      }

      await refreshSecureData();
      setSaveMsg('Encrypted share created');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setPlanPrompt(getPlanErrorPrompt(err));
      setSecureError(err instanceof Error ? err.message : 'Failed to create encrypted share');
    } finally {
      setShareBusy(false);
    }
  }, [attachments, currentTree, id, isLocalMode, refreshSecureData, savedTitle, sessionKeys, title]);
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
        key={editorKey}
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
        onShowHistory={() => { if (!isLocalMode) setShowHistory(true); }}
        onExportMarkdown={handleExportMarkdown}
        versionLabel={versionLabel}
        versionTooltip={versionTooltip}
        onTreeChange={setCurrentTree}
        onSelectionChange={setSelectedNodeId}
        onOpenSecurePanel={openSecurePanel}
        onNodeFileDrop={(nodeId, files) => uploadEncryptedNodeFiles(nodeId, files)}
        onOpenNodeAttachment={(attachment) => { void handleOpenNodeAttachment(attachment); }}
        onDeleteNodeAttachment={(attachment) => { void handleDeleteNodeAttachment(attachment); }}
        onLoadNodeAttachmentPreview={(attachment) => handleLoadNodeAttachmentPreview(attachment)}
      />
      {!isLocalMode && showHistory && (
        <VersionHistoryPanel
          className="mm-version-panel--overlay"
          vaultId={id!}
          onClose={() => setShowHistory(false)}
          onLoad={loadVersion}
          loadingVersionId={loadingVersionId}
          onDeleteVersion={handleDeleteVersion}
        />
      )}
      {!isLocalMode && (
        <EncryptedVaultDialog
          open={secureDialogOpen}
          initialTab={secureDialogTab}
          attachments={attachments}
          shares={shares}
          selectedNodeId={selectedNodeId}
          nodeOptions={nodeOptions}
          loading={secureLoading}
          error={secureError}
          uploadState={attachmentUpload}
          shareBusy={shareBusy}
          onClose={() => setSecureDialogOpen(false)}
          onRefresh={() => { void refreshSecureData(); }}
          onUploadFiles={(files) => { void handleUploadFiles(files); }}
          onDownloadAttachment={(attachment) => { void handleDownloadAttachment(attachment); }}
          onDeleteAttachment={(attachment) => { void handleDeleteAttachment(attachment); }}
          onAssignAttachmentNode={(attachment, nodeId) => { void handleAssignAttachmentNode(attachment, nodeId); }}
          onCreateShare={(draft) => { void handleCreateShare(draft); }}
          onCopyShareUrl={(share) => { void handleCopyShareUrl(share); }}
          onRevokeShare={(share) => { void handleRevokeShare(share); }}
        />
      )}
    </div>
  );
}

import type { ExportFormat } from '../utils/exportFormats';
import type { MindMapTree, NodeAttachmentRef } from '../types';
import type { LinkableVault } from './MindMapVaultLinkDialog';

export interface MindMapEditorProps {
  initialTree: MindMapTree | null;
  initialShowShortcuts?: boolean;
  disableAutoPanToSelection?: boolean;
  externalNodeAttachments?: Record<string, NodeAttachmentRef[]>;
  title: string;
  onSave: (tree: MindMapTree, title: string) => Promise<void>;
  onTitleChange: (title: string) => void;
  saving: boolean;
  saveMsg: string;
  error: string;
  onBack?: () => void;
  onDownloadEncrypted?: (fileBaseName?: string) => void;
  onDownloadJson?: (tree: MindMapTree, title: string) => void;
  /** The formats the export menu offers. One entry per format. */
  exportFormats?: ExportFormat[];
  onExport?: (format: ExportFormat, tree: MindMapTree, baseName: string) => void | Promise<void>;
  titleChanged?: boolean;
  onRenameTitle?: () => void;
  renamingTitle?: boolean;
  versionLabel?: string;
  versionTooltip?: string;
  onTreeChange?: (tree: MindMapTree) => void;
  onSelectionChange?: (nodeId: string | null) => void;
  onNodeFileDrop?: (nodeId: string, files: File[]) => Promise<NodeAttachmentRef[]>;
  onOpenNodeAttachment?: (attachment: NodeAttachmentRef) => Promise<void> | void;
  onFetchNodeAttachmentContent?: (attachment: NodeAttachmentRef) => Promise<{ name: string; contentType: string; blob: Blob } | null>;
  onDeleteNodeAttachment?: (attachment: NodeAttachmentRef) => Promise<void> | void;
  onLoadNodeAttachmentPreview?: (attachment: NodeAttachmentRef) => Promise<string | null>;
  /** This vault's own id, so it can be kept out of the link picker. */
  vaultId?: string;
  /** Vaults this map can link a node to, titles already decrypted. */
  linkableVaults?: LinkableVault[];
  linkableVaultsLoading?: boolean;
  /** Asked for when the picker opens, so the list is not fetched on every edit. */
  onRequestLinkableVaults?: () => void;
  /** Follows a node's vault link. Navigation belongs to the page. */
  onOpenVaultLink?: (vaultId: string) => void;
}
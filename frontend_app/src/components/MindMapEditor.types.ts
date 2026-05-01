import type { MindMapTree, NodeAttachmentRef } from '../types';

export interface MindMapEditorProps {
  initialTree: MindMapTree | null;
  externalNodeAttachments?: Record<string, NodeAttachmentRef[]>;
  title: string;
  onSave: (tree: MindMapTree, title: string) => Promise<void>;
  onTitleChange: (title: string) => void;
  saving: boolean;
  saveMsg: string;
  error: string;
  onBack?: () => void;
  onShowHistory?: () => void;
  onExportMarkdown?: (tree: MindMapTree, title: string) => void;
  titleChanged?: boolean;
  onRenameTitle?: () => void;
  renamingTitle?: boolean;
  versionLabel?: string;
  versionTooltip?: string;
  onTreeChange?: (tree: MindMapTree) => void;
  onSelectionChange?: (nodeId: string | null) => void;
  onOpenSecurePanel?: (tab: 'attachments' | 'shares') => void;
  onNodeFileDrop?: (nodeId: string, files: File[]) => Promise<NodeAttachmentRef[]>;
  onOpenNodeAttachment?: (attachment: NodeAttachmentRef) => Promise<void> | void;
  onDeleteNodeAttachment?: (attachment: NodeAttachmentRef) => Promise<void> | void;
  onLoadNodeAttachmentPreview?: (attachment: NodeAttachmentRef) => Promise<string | null>;
}
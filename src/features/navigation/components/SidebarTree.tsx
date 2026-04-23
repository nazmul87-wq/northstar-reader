import { useState } from 'react'
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus2,
  Hash,
  Layers,
  Trash2,
} from 'lucide-react'
import type { TreeNode } from '../../workspace/data/mockWorkspace'
import '../navigation.css'

type SidebarTreeProps = {
  tree: TreeNode[]
  folders: Array<{
    label: string
    value: string
  }>
  activeDocumentPath: string
  onOpenDocument: (path: string) => void
  onCreateNote: (parentPath?: string) => void
  onCreateFolder: (parentPath?: string) => void
  onDeleteDocument: (path: string) => void
}

const META_ICONS: Record<string, typeof Hash> = {
  Notes: FileText,
  Tags: Hash,
  'Open tabs': Layers,
}

export function SidebarTree({
  tree,
  folders,
  activeDocumentPath,
  onOpenDocument,
  onCreateNote,
  onCreateFolder,
  onDeleteDocument,
}: SidebarTreeProps) {
  return (
    <section className="tree-panel fade-up" style={{ animationDelay: '80ms' }}>
      <div className="tree-panel__header">
        <div>
          <p className="eyebrow">Vault</p>
          <h3>File tree</h3>
        </div>
        <div className="tree-panel__header-actions">
          <button
            type="button"
            className="tree-panel__cta"
            onClick={() => onCreateNote()}
            title="Create a new note"
          >
            <FilePlus2 size={13} />
            Note
          </button>
          <button
            type="button"
            className="tree-panel__cta"
            onClick={() => onCreateFolder()}
            title="Create a new folder"
          >
            <FolderPlus size={13} />
            Folder
          </button>
        </div>
      </div>

      <div className="tree-panel__meta">
        {folders.map((folder) => {
          const Icon = META_ICONS[folder.label] ?? FileText
          return (
            <div key={folder.label} className="tree-panel__meta-card">
              <span>
                <Icon size={12} />
                {folder.label}
              </span>
              <strong>{folder.value}</strong>
            </div>
          )
        })}
      </div>

      <div className="tree-root" role="tree" aria-label="Markdown files">
        {tree.length ? (
          tree.map((node) => (
            <TreeBranch
              key={node.id}
              node={node}
              level={0}
              activeDocumentPath={activeDocumentPath}
              onOpenDocument={onOpenDocument}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onDeleteDocument={onDeleteDocument}
            />
          ))
        ) : (
          <div className="tree-empty">
            <FileText size={22} />
            <p>No notes yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </section>
  )
}

type TreeBranchProps = {
  node: TreeNode
  level: number
  activeDocumentPath: string
  onOpenDocument: (path: string) => void
  onCreateNote: (parentPath?: string) => void
  onCreateFolder: (parentPath?: string) => void
  onDeleteDocument: (path: string) => void
}

function TreeBranch({
  node,
  level,
  activeDocumentPath,
  onOpenDocument,
  onCreateNote,
  onCreateFolder,
  onDeleteDocument,
}: TreeBranchProps) {
  const isActive = node.path === activeDocumentPath
  const isFolder = node.type === 'folder'
  const [expanded, setExpanded] = useState(level < 1)

  const hasChildren = Boolean(node.children?.length)

  return (
    <div className="tree-branch">
      <div
        className={`tree-row${isActive ? ' tree-row--active' : ''}${isFolder ? ' tree-row--folder' : ''}`}
        style={{ paddingInlineStart: `${level * 0.85 + 0.35}rem` }}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={isFolder ? expanded : undefined}
      >
        {isFolder ? (
          <button
            type="button"
            className="tree-row__chevron"
            aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronRight
              size={14}
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform var(--duration-fast) var(--ease-out)',
              }}
            />
          </button>
        ) : (
          <span className="tree-row__chevron tree-row__chevron--spacer" aria-hidden="true" />
        )}

        <button
          type="button"
          className="tree-row__main"
          onClick={() => (isFolder ? setExpanded((value) => !value) : onOpenDocument(node.path))}
          onDoubleClick={() => (isFolder ? setExpanded((value) => !value) : undefined)}
        >
          <span className={`tree-row__icon tree-row__icon--${node.type}`} aria-hidden="true">
            {isFolder ? (
              expanded ? <FolderOpen size={14} /> : <Folder size={14} />
            ) : (
              <FileText size={14} />
            )}
          </span>
          <span className="tree-row__name" title={node.path}>{node.name}</span>
        </button>

        <div className="tree-row__actions">
          {isFolder ? (
            <>
              <button
                type="button"
                className="tree-action"
                onClick={(event) => {
                  event.stopPropagation()
                  onCreateNote(node.path)
                }}
                title="New note in folder"
              >
                <FilePlus2 size={12} />
              </button>
              <button
                type="button"
                className="tree-action"
                onClick={(event) => {
                  event.stopPropagation()
                  onCreateFolder(node.path)
                }}
                title="New subfolder"
              >
                <FolderPlus size={12} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="tree-action tree-action--danger"
              onClick={(event) => {
                event.stopPropagation()
                onDeleteDocument(node.path)
              }}
              title="Delete note"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {hasChildren && expanded ? (
        <div role="group" className="tree-children">
          {node.children!.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              level={level + 1}
              activeDocumentPath={activeDocumentPath}
              onOpenDocument={onOpenDocument}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onDeleteDocument={onDeleteDocument}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

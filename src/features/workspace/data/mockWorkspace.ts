import { parseMetadata, titleFromPath } from '../../../shared/lib/markdown'

export type NavigationItem = {
  id: string
  label: string
  badge?: string
}

export type TreeNode = {
  id: string
  name: string
  type: 'folder' | 'file'
  path: string
  children?: TreeNode[]
}

export type WorkspaceDocument = {
  id: string
  title: string
  path: string
  description: string
  updatedAt: string
  modifiedMs: number
  unsaved?: boolean
  content: string
  markdownLines: string[]
  tags: string[]
  properties: Record<string, unknown>
}

export type SearchGroup = {
  title: string
  items: Array<{
    id: string
    label: string
    meta: string
    documentId?: string
  }>
}

export type CommandItem = {
  id: string
  label: string
  hint: string
  shortcut: string
  documentId?: string
}

export type BacklinkItem = {
  source: string
  path: string
  context: string
  strength: string
}

export type PropertyGroup = {
  title: string
  values: Array<{
    label: string
    value: string
  }>
}

export type ActivityItem = {
  label: string
  meta: string
}

export type WorkspaceSummary = {
  name: string
  summary: string
  linkDensity: string
  storageLabel: string
  pendingPlugins: number
}

export const navigationItems: NavigationItem[] = [
  { id: 'library', label: 'Library' },
  { id: 'search', label: 'Search' },
  { id: 'graph', label: 'Graph', badge: 'Soon' },
  { id: 'canvas', label: 'Canvas', badge: 'Soon' },
  { id: 'plugins', label: 'Plugins', badge: 'Future' },
]

export const pluginHooks: ActivityItem[] = [
  { label: 'Inspector card slot', meta: 'Reserved for plugin widgets' },
  { label: 'Command palette contributions', meta: 'Safe extension point' },
  { label: 'Canvas embeddings', meta: 'Future renderer mount' },
]

const demoNotes: Record<string, string> = {
  'Welcome.md': `---
title: Welcome
tags:
  - getting-started
  - local-first
status: active
---

# Welcome

Northstar is a local-first Markdown workspace with strong defaults.

## Start here

- Open a vault from disk
- Create a note from the sidebar
- Link concepts with [[Project Compass]]
- Use Ctrl+K to jump quickly

> Keep your notes on disk, not trapped in a database.
`,
  'Projects/Project Compass.md': `---
title: Project Compass
owner: Nazmul
tags: [planning, project]
---

# Project Compass

This note anchors the current work and points toward [[Welcome]].

## Next actions

- [ ] Review backlinks
- [ ] Add properties
`,
  'Daily/Daily Notes.md': `# Daily Notes

Capture small ideas, then link them into bigger structures.

- Follow up on [[Project Compass]]
`,
}

export function createDemoWorkspace() {
  const documents = Object.entries(demoNotes).map(([path, content]) =>
    createWorkspaceDocument(path, content, Date.now()),
  )

  return {
    summary: buildWorkspaceSummary('Northstar Demo', 'demo://vault', documents.length),
    tree: buildTree(documents.map((document) => document.path)),
    documents,
  }
}

export function createWorkspaceDocument(path: string, content: string, modifiedMs: number): WorkspaceDocument {
  const metadata = parseMetadata(path, content)
  return {
    id: path,
    title: metadata.title,
    path,
    description: metadata.headings[0] ?? `Markdown note in ${folderLabel(path)}`,
    updatedAt: formatUpdatedLabel(modifiedMs),
    modifiedMs,
    content,
    markdownLines: content.split('\n'),
    tags: metadata.tags,
    properties: metadata.properties,
  }
}

export function buildWorkspaceSummary(name: string, path: string, backlinkCount: number): WorkspaceSummary {
  return {
    name,
    summary:
      'Plain Markdown notes, local indexing, backlink context, and quick navigation with less setup friction.',
    linkDensity: `${backlinkCount} local references tracked`,
    storageLabel: path,
    pendingPlugins: 3,
  }
}

export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  const map = new Map<string, TreeNode>()

  for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
    const parts = path.split('/')
    let currentChildren = root
    let currentPath = ''

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const existing = map.get(currentPath)
      const isFile = index === parts.length - 1

      if (existing) {
        currentChildren = existing.children ?? []
        return
      }

      const node: TreeNode = {
        id: currentPath,
        name: part,
        type: isFile ? 'file' : 'folder',
        path: currentPath,
        children: isFile ? undefined : [],
      }

      currentChildren.push(node)
      map.set(currentPath, node)
      currentChildren = node.children ?? currentChildren
    })
  }

  return sortNodes(root)
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
}

function folderLabel(path: string) {
  const parts = path.split('/')
  if (parts.length === 1) {
    return 'the vault root'
  }
  return parts.slice(0, -1).join(' / ')
}

function formatUpdatedLabel(modifiedMs: number) {
  const deltaMinutes = Math.max(1, Math.round((Date.now() - modifiedMs) / 60000))
  if (deltaMinutes < 60) {
    return `Edited ${deltaMinutes} min ago`
  }
  const deltaHours = Math.round(deltaMinutes / 60)
  if (deltaHours < 24) {
    return `Edited ${deltaHours} hr ago`
  }
  const deltaDays = Math.round(deltaHours / 24)
  return `Edited ${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`
}

export function displayNameFromPath(path: string) {
  return titleFromPath(path)
}

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../lib/tauri'
import { buildTree, createDemoWorkspace, createWorkspaceDocument } from '../../features/workspace/data/mockWorkspace'

type VaultContext = {
  name: string
  rootPath: string
  metadataPath: string
  indexDbPath: string
}

type RecentVault = {
  name: string
  rootPath: string
  lastOpenedMs: number
}

type MarkdownDocument = {
  path: string
  content: string
  sizeBytes: number
  modifiedMs: number
}

type FileTreeEntry = {
  path: string
  name: string
  kind: 'directory' | 'markdown_file'
  depth: number
  parentPath?: string | null
}

type SearchResult = {
  path: string
  title: string
  snippet: string
  score: number
}

type BacklinkReference = {
  sourcePath: string
  sourceTitle: string
  preview: string
  kind: string
}

const demoState = (() => {
  const demo = createDemoWorkspace()
  return {
    vault: {
      name: demo.summary.name,
      rootPath: 'demo://vault',
      metadataPath: 'demo://vault/.northstar',
      indexDbPath: 'demo://vault/.northstar/index.sqlite3',
    } satisfies VaultContext,
    documents: Object.fromEntries(demo.documents.map((document) => [document.path, document])),
    tree: demo.tree,
  }
})()

export async function listRecentVaults() {
  if (!isTauri()) {
    return [
      {
        name: 'Northstar Demo',
        rootPath: 'demo://vault',
        lastOpenedMs: Date.now(),
      } satisfies RecentVault,
    ]
  }

  return invoke<RecentVault[]>('list_recent_vaults')
}

export async function currentVault() {
  if (!isTauri()) {
    return null
  }

  return invoke<VaultContext | null>('current_vault')
}

export async function openVault(path: string) {
  if (!isTauri()) {
    return demoState.vault
  }

  return invoke<VaultContext>('open_vault', { path })
}

export async function createVault(path: string, name?: string) {
  if (!isTauri()) {
    demoState.vault = {
      ...demoState.vault,
      name: name?.trim() || 'Northstar Demo',
      rootPath: path,
    }
    return demoState.vault
  }

  return invoke<VaultContext>('create_vault', {
    path,
    name,
  })
}

export async function listFileTree() {
  if (!isTauri()) {
    return flattenDemoTree(demoState.tree)
  }

  return invoke<FileTreeEntry[]>('list_file_tree')
}

export async function readMarkdownFile(relativePath: string) {
  if (!isTauri()) {
    const document = demoState.documents[relativePath]
    if (!document) {
      throw new Error(`Demo note not found: ${relativePath}`)
    }
    return {
      path: document.path,
      content: document.content,
      sizeBytes: document.content.length,
      modifiedMs: document.modifiedMs,
    } satisfies MarkdownDocument
  }

  return invoke<MarkdownDocument>('read_markdown_file', { relativePath })
}

export async function writeMarkdownFile(relativePath: string, content: string) {
  if (!isTauri()) {
    const document = createWorkspaceDocument(relativePath, content, Date.now())
    demoState.documents[relativePath] = document
    demoState.tree = buildTree(Object.keys(demoState.documents))
    return {
      path: document.path,
      content: document.content,
      sizeBytes: document.content.length,
      modifiedMs: document.modifiedMs,
    } satisfies MarkdownDocument
  }

  return invoke<MarkdownDocument>('write_markdown_file', { relativePath, content })
}

export async function createMarkdownFile(relativePath: string, content = '') {
  if (!isTauri()) {
    const document = createWorkspaceDocument(relativePath, content, Date.now())
    demoState.documents[relativePath] = document
    demoState.tree = buildTree(Object.keys(demoState.documents))
    return {
      path: document.path,
      content: document.content,
      sizeBytes: document.content.length,
      modifiedMs: document.modifiedMs,
    } satisfies MarkdownDocument
  }

  return invoke<MarkdownDocument>('create_markdown_file', { relativePath, content })
}

export async function createFolder(relativePath: string) {
  if (!isTauri()) {
    return
  }

  await invoke('create_folder', { relativePath })
}

export async function deleteEntry(relativePath: string, recursive = false) {
  if (!isTauri()) {
    delete demoState.documents[relativePath]
    demoState.tree = buildTree(Object.keys(demoState.documents))
    return
  }

  await invoke('delete_entry', { relativePath, recursive })
}

export async function searchVault(query: string, limit = 20) {
  if (!isTauri()) {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return []
    }
    return Object.values(demoState.documents)
      .map((document) => {
        const index = document.content.toLowerCase().indexOf(normalized)
        if (index === -1 && !document.title.toLowerCase().includes(normalized)) {
          return null
        }
        return {
          path: document.path,
          title: document.title,
          snippet: document.content.slice(Math.max(0, index - 60), index + normalized.length + 120),
          score: 1 / Math.max(1, index + 1),
        } satisfies SearchResult
      })
      .filter((value): value is SearchResult => Boolean(value))
  }

  return invoke<SearchResult[]>('search_vault', { query, limit })
}

export async function getBacklinks(targetPath: string) {
  if (!isTauri()) {
    const references: BacklinkReference[] = []
    for (const document of Object.values(demoState.documents)) {
      if (document.path === targetPath) {
        continue
      }
      if (document.content.includes(`[[${documentTitleFromPath(targetPath)}]]`)) {
        references.push({
          sourcePath: document.path,
          sourceTitle: document.title,
          preview: document.content.split('\n').find((line) => line.includes('[[')) ?? document.description,
          kind: 'wiki',
        })
      }
    }
    return references
  }

  return invoke<BacklinkReference[]>('get_backlinks', { targetPath, limit: 100 })
}

function flattenDemoTree(nodes: typeof demoState.tree, depth = 0, parentPath?: string | null): FileTreeEntry[] {
  return nodes.flatMap((node) => {
    const entry: FileTreeEntry = {
      path: node.path,
      name: node.name,
      kind: node.type === 'folder' ? 'directory' : 'markdown_file',
      depth,
      parentPath,
    }
    return [entry, ...flattenDemoTree(node.children ?? [], depth + 1, node.path)]
  })
}

function documentTitleFromPath(path: string) {
  return path.split('/').pop()?.replace(/\.md$/i, '') ?? path
}

import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildWorkspaceSummary,
  buildTree,
  createDemoWorkspace,
  createWorkspaceDocument,
  displayNameFromPath,
  navigationItems,
  pluginHooks,
  type ActivityItem,
  type BacklinkItem,
  type CommandItem,
  type PropertyGroup,
  type SearchGroup,
  type TreeNode,
  type WorkspaceDocument,
} from '../data/mockWorkspace'
import {
  createFolder,
  createMarkdownFile,
  createVault,
  currentVault,
  deleteEntry,
  getBacklinks,
  listFileTree,
  listRecentVaults,
  openVault,
  readMarkdownFile,
  searchVault,
  writeMarkdownFile,
} from '../../../shared/api/vaultApi'
import { buildFrontmatter, parseMetadata, titleFromPath } from '../../../shared/lib/markdown'
import { isTauri } from '../../../shared/lib/tauri'

type RecentVault = {
  name: string
  rootPath: string
  lastOpenedMs: number
}

type VaultRecord = {
  name: string
  rootPath: string
}

export function useWorkspaceShell() {
  const [activeNavItemId, setActiveNavItemId] = useState('library')
  const [vault, setVault] = useState<VaultRecord | null>(null)
  const [workspaceTree, setWorkspaceTree] = useState<TreeNode[]>([])
  const [documentsByPath, setDocumentsByPath] = useState<Record<string, WorkspaceDocument>>({})
  const [openTabIds, setOpenTabIds] = useState<string[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [recentVaults, setRecentVaults] = useState<RecentVault[]>([])
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([])
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [isSearchPanelOpen, setSearchPanelOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [commandQuery, setCommandQuery] = useState('')
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; label: string; meta: string; documentId: string }>
  >([])
  const [statusMessage, setStatusMessage] = useState('Ready')
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)

  function resetVaultState() {
    setDocumentsByPath({})
    setOpenTabIds([])
    setActiveTabId(null)
    setBacklinks([])
    setSearchQuery('')
    setSearchResults([])
    setCommandQuery('')
    setSearchPanelOpen(false)
    setCommandPaletteOpen(false)
  }

  async function loadRecents() {
    const items = await listRecentVaults()
    setRecentVaults(items)
  }

  async function refreshTree() {
    const entries = await listFileTree()
    const notes = entries.filter((entry) => entry.kind === 'markdown_file').map((entry) => entry.path)
    setWorkspaceTree(buildTree(notes))
  }

  async function loadDocument(path: string) {
    const payload = await readMarkdownFile(path)
    const nextDocument = createWorkspaceDocument(path, payload.content, payload.modifiedMs)

    setDocumentsByPath((current) => ({
      ...current,
      [path]: current[path]?.unsaved ? current[path] : nextDocument,
    }))

    setOpenTabIds((current) => (current.includes(path) ? current : [...current, path]))
    setActiveTabId(path)

    const references = await getBacklinks(path)
    setBacklinks(
      references.map((reference) => ({
        source: reference.sourceTitle,
        path: reference.sourcePath,
        context: reference.preview,
        strength: reference.kind === 'wiki' ? 'Wiki-link' : 'Markdown link',
      })),
    )
  }

  useEffect(() => {
    const run = async () => {
      await loadRecents()

      if (!isTauri()) {
        setIsReady(true)
        return
      }

      const existing = await currentVault()
      if (!existing) {
        setIsReady(true)
        return
      }

      resetVaultState()
      setVault({ name: existing.name, rootPath: existing.rootPath })
      setIsDemoMode(false)
      await refreshTree()
      const firstPath = (await listFileTree()).find((entry) => entry.kind === 'markdown_file')?.path
      if (firstPath) {
        await loadDocument(firstPath)
      }
      setIsReady(true)
    }

    void run()
  }, [])

  useEffect(() => {
    if (!isTauri()) {
      return
    }

    let unlisten: (() => void) | undefined
    void listen<{ paths: string[] }>('vault://fs-event', async () => {
      await refreshTree()
      if (activeTabId) {
        await loadDocument(activeTabId)
      }
    }).then((dispose) => {
      unlisten = dispose
    })

    return () => {
      unlisten?.()
    }
  }, [activeTabId])

  const activeDocument = activeTabId ? documentsByPath[activeTabId] ?? null : null

  const saveActiveDocument = useCallback(async () => {
    if (!activeDocument) {
      return
    }

    setIsSaving(true)
    setStatusMessage(`Saving ${activeDocument.title}`)
    const result = await writeMarkdownFile(activeDocument.path, activeDocument.content)
    const saved = createWorkspaceDocument(activeDocument.path, result.content, result.modifiedMs)
    setDocumentsByPath((current) => ({
      ...current,
      [activeDocument.path]: saved,
    }))
    setIsSaving(false)
    setStatusMessage(`Saved ${saved.title}`)
    await refreshTree()
    await loadDocument(saved.path)
  }, [activeDocument])

  useEffect(() => {
    const handleGlobalKeys = (event: KeyboardEvent) => {
      const withModifier = event.ctrlKey || event.metaKey

      if (withModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((open) => !open)
      }

      if (withModifier && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchPanelOpen((open) => !open)
      }

      if ((withModifier && event.key.toLowerCase() === 's') || event.key === 'F2') {
        event.preventDefault()
        void saveActiveDocument()
      }

      if (event.key === 'Escape') {
        setCommandPaletteOpen(false)
        setSearchPanelOpen(false)
      }
    }

    window.addEventListener('keydown', handleGlobalKeys)
    return () => window.removeEventListener('keydown', handleGlobalKeys)
  }, [activeTabId, documentsByPath, saveActiveDocument])

  useEffect(() => {
    if (!searchQuery.trim()) {
      return
    }

    const handle = window.setTimeout(async () => {
      const results = await searchVault(searchQuery, 20)
      setSearchResults(
        results.map((result) => ({
          id: result.path,
          label: result.title,
          meta: `${result.path} • ${result.snippet}`,
          documentId: result.path,
        })),
      )
    }, 140)

    return () => window.clearTimeout(handle)
  }, [searchQuery])

  useEffect(() => {
    if (!activeDocument?.unsaved) {
      return
    }

    const handle = window.setTimeout(() => {
      void saveActiveDocument()
    }, 550)

    return () => window.clearTimeout(handle)
  }, [activeDocument?.content, activeDocument?.unsaved, activeDocument?.path, saveActiveDocument])

  const workspace = useMemo(() => {
    if (!vault) {
      return buildWorkspaceSummary('Northstar', 'No vault open', backlinks.length)
    }
    return buildWorkspaceSummary(vault.name, vault.rootPath, backlinks.length)
  }, [backlinks.length, vault])

  const sidebarFolders = useMemo(
    () => [
      { label: 'Notes', value: String(countFiles(workspaceTree)) },
      { label: 'Tags', value: String(new Set(Object.values(documentsByPath).flatMap((doc) => doc.tags)).size) },
      { label: 'Open tabs', value: String(openTabIds.length) },
    ],
    [documentsByPath, openTabIds.length, workspaceTree],
  )

  const searchGroups: SearchGroup[] = useMemo(
    () => [{
      title: 'Best matches',
      items: searchResults,
    }],
    [searchResults],
  )

  const vaultNoteItems = useMemo(
    () => flattenTree(workspaceTree),
    [workspaceTree],
  )

  const commandItems: CommandItem[] = useMemo(
    () => [
      {
        id: 'new-note',
        label: 'Create note',
        hint: 'Create a new Markdown note in the current vault.',
        shortcut: 'Ctrl+N',
      },
      {
        id: 'toggle-search',
        label: 'Toggle full search panel',
        hint: 'Open indexed search results.',
        shortcut: 'Ctrl+Shift+F',
      },
      ...vaultNoteItems.map((item) => ({
        id: `open-${item.path}`,
        label: `Open ${item.label}`,
        hint: item.path,
        shortcut: 'Enter',
        documentId: item.path,
      })),
    ],
    [vaultNoteItems],
  )

  const quickSwitcherItems = useMemo(() => {
    const items = vaultNoteItems.map((item) => {
      const existing = documentsByPath[item.path]
      return existing ?? {
        id: item.path,
        title: item.label,
        path: item.path,
        description: `Markdown note in ${item.path}`,
        updatedAt: 'Not opened yet',
        modifiedMs: 0,
        content: '',
        markdownLines: [],
        tags: [],
        properties: {},
      }
    })
    return commandQuery.trim()
      ? items.filter((item) =>
          `${item.title} ${item.path} ${item.content}`.toLowerCase().includes(commandQuery.toLowerCase()),
        )
      : items
  }, [commandQuery, documentsByPath, vaultNoteItems])

  const properties: PropertyGroup[] = useMemo(() => {
    if (!activeDocument) {
      return []
    }

    const propertyValues = Object.entries(activeDocument.properties)
      .filter(([label]) => label !== 'tags')
      .map(([label, value]) => ({
      label,
      value: Array.isArray(value) ? value.join(', ') : String(value),
      }))

    return [
      {
        title: 'Metadata',
        values: propertyValues,
      },
    ]
  }, [activeDocument])

  const activity: ActivityItem[] = useMemo(
    () => [
      { label: statusMessage, meta: isSaving ? 'In progress' : 'Current status' },
      { label: isDemoMode ? 'Demo mode' : 'Local-first mode', meta: workspace.storageLabel },
      {
        label: activeDocument ? activeDocument.updatedAt : 'No note open',
        meta: activeDocument?.path ?? 'Pick a note to start',
      },
    ],
    [activeDocument, isDemoMode, isSaving, statusMessage, workspace.storageLabel],
  )

  async function openDocument(path: string) {
    setStatusMessage(`Opening ${titleFromPath(path)}`)
    await loadDocument(path)
  }

  async function openVaultAt(path: string) {
    const nextVault = await openVault(path)
    resetVaultState()
    setVault({ name: nextVault.name, rootPath: nextVault.rootPath })
    setIsDemoMode(false)
    setStatusMessage(`Opened ${nextVault.name}`)
    await refreshTree()
    await loadRecents()
    const firstPath = (await listFileTree()).find((entry) => entry.kind === 'markdown_file')?.path
    if (firstPath) {
      await loadDocument(firstPath)
    }
  }

  async function createVaultAt(path: string, name?: string) {
    const nextVault = await createVault(path, name)
    resetVaultState()
    setVault({ name: nextVault.name, rootPath: nextVault.rootPath })
    setIsDemoMode(false)
    setStatusMessage(`Created ${nextVault.name}`)
    await refreshTree()
    await loadRecents()
  }

  async function loadDemo() {
    const demo = createDemoWorkspace()
    resetVaultState()
    setVault({ name: demo.summary.name, rootPath: 'demo://vault' })
    setWorkspaceTree(demo.tree)
    setDocumentsByPath(
      Object.fromEntries(demo.documents.map((document) => [document.path, document])),
    )
    setOpenTabIds([demo.documents[0].path])
    setActiveTabId(demo.documents[0].path)
    setIsDemoMode(true)
    setStatusMessage('Loaded demo workspace')
    setBacklinks([
      {
        source: 'Project Compass',
        path: 'Projects/Project Compass.md',
        context: 'This note anchors the current work and points toward [[Welcome]].',
        strength: 'Wiki-link',
      },
    ])
    setIsReady(true)
  }

  async function createNote(parentPath?: string) {
    if (!vault) {
      return
    }

    const name = window.prompt('New note title', 'Untitled note')?.trim()
    if (!name) {
      return
    }

    const relativePath = parentPath ? `${parentPath}/${name}.md` : `${name}.md`
    const content = `# ${name}\n\n`
    await createMarkdownFile(relativePath, content)
    await refreshTree()
    await loadDocument(relativePath)
  }

  async function createFolderAt(parentPath?: string) {
    if (!vault || isDemoMode) {
      return
    }

    const name = window.prompt('New folder name', 'New Folder')?.trim()
    if (!name) {
      return
    }

    const relativePath = parentPath ? `${parentPath}/${name}` : name
    await createFolder(relativePath)
    await refreshTree()
  }

  function closeTab(path: string) {
    setOpenTabIds((current) => {
      const next = current.filter((item) => item !== path)
      if (activeTabId === path) {
        const fallback = next[next.length - 1] ?? null
        setActiveTabId(fallback)
        if (fallback) {
          void loadDocument(fallback)
        } else {
          setBacklinks([])
        }
      }
      return next
    })
  }

  async function deleteNote(path: string) {
    const confirmed = window.confirm(`Delete "${path}" from the vault?`)
    if (!confirmed) {
      return
    }

    await deleteEntry(path)
    setDocumentsByPath((current) => {
      const next = { ...current }
      delete next[path]
      return next
    })
    setOpenTabIds((current) => current.filter((item) => item !== path))
    if (activeTabId === path) {
      setActiveTabId(null)
      setBacklinks([])
    }
    await refreshTree()
  }

  function updateDocumentContent(content: string) {
    if (!activeDocument) {
      return
    }

    const metadata = parseMetadata(activeDocument.path, content)
    setDocumentsByPath((current) => ({
      ...current,
      [activeDocument.path]: {
        ...current[activeDocument.path],
        content,
        markdownLines: content.split('\n'),
        title: metadata.title,
        description: metadata.headings[0] ?? current[activeDocument.path].description,
        tags: metadata.tags,
        properties: metadata.properties,
        unsaved: true,
      },
    }))
    setStatusMessage(`Editing ${activeDocument.title}`)
  }

  async function applyProperties(nextProperties: Record<string, unknown>, nextTags: string[]) {
    if (!activeDocument) {
      return
    }
    const mergedProperties = {
      ...nextProperties,
      tags: nextTags,
    }
    const nextContent = buildFrontmatter(activeDocument.content, mergedProperties)
    updateDocumentContent(nextContent)
    await saveActiveDocument()
  }

  return {
    activeNavItemId,
    activeTabId,
    activeDocument,
    activity,
    backlinks,
    commandItems,
    commandQuery,
    hasVault: Boolean(vault),
    isCommandPaletteOpen,
    isReady,
    isSaving,
    isSearchPanelOpen,
    isDemoMode,
    navigationItems,
    openTabs: openTabIds.map((path) => documentsByPath[path]).filter(Boolean),
    pluginHooks,
    properties,
    quickSwitcherItems,
    recentVaults,
    searchGroups,
    searchQuery,
    sidebarFolders,
    statusMessage,
    workspace,
    workspaceTree,
    linkSuggestions: vaultNoteItems,
    setActiveNavItemId,
    setActiveTabId: (nextPath: string) => {
      setActiveTabId(nextPath)
      void loadDocument(nextPath)
    },
    setCommandQuery,
    setSearchQuery: (value: string) => {
      setSearchQuery(value)
      if (!value.trim()) {
        setSearchResults([])
      }
    },
    openDocument,
    openVaultAt,
    createVaultAt,
    createNote,
    createFolderAt,
    deleteNote,
    closeTab,
    loadDemo,
    updateDocumentContent,
    saveActiveDocument,
    applyProperties,
    toggleCommandPalette: () => setCommandPaletteOpen((open) => !open),
    closeCommandPalette: () => setCommandPaletteOpen(false),
    toggleSearchPanel: () => setSearchPanelOpen((open) => !open),
    closeSearchPanel: () => setSearchPanelOpen(false),
  }
}

function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce((total, node) => {
    if (node.type === 'file') {
      return total + 1
    }
    return total + countFiles(node.children ?? [])
  }, 0)
}

function flattenTree(nodes: TreeNode[]): Array<{ label: string; path: string }> {
  return nodes.flatMap((node) => {
    if (node.type === 'file') {
      return [{
        label: displayNameFromPath(node.path),
        path: node.path,
      }]
    }

    return flattenTree(node.children ?? [])
  })
}

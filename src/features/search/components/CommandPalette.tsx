import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Command as CommandIcon,
  CornerDownLeft,
  FilePlus2,
  FileText,
  Keyboard,
  SearchX,
  Search as SearchIcon,
} from 'lucide-react'
import type { CommandItem, WorkspaceDocument } from '../../workspace/data/mockWorkspace'
import '../search.css'

type CommandPaletteProps = {
  query: string
  commands: CommandItem[]
  recentDocuments: WorkspaceDocument[]
  onQueryChange: (value: string) => void
  onClose: () => void
  onOpenDocument: (documentId: string) => void
  onCreateNote: () => void
  onToggleSearch: () => void
}

type PaletteRow =
  | { kind: 'command'; group: string; item: CommandItem }
  | { kind: 'document'; group: string; item: WorkspaceDocument }

export function CommandPalette({
  query,
  commands,
  recentDocuments,
  onQueryChange,
  onClose,
  onOpenDocument,
  onCreateNote,
  onToggleSearch,
}: CommandPaletteProps) {
  const filteredCommands = useMemo(
    () =>
      query.trim()
        ? commands.filter((command) =>
            `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase()),
          )
        : commands,
    [commands, query],
  )

  const rows = useMemo<PaletteRow[]>(
    () => [
      ...filteredCommands.map((command) => ({ kind: 'command' as const, group: 'Commands', item: command })),
      ...recentDocuments.map((document) => ({ kind: 'document' as const, group: 'Open notes', item: document })),
    ],
    [filteredCommands, recentDocuments],
  )

  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const commandsWithIndex = useMemo(
    () => filteredCommands.map((command, index) => ({ command, index })),
    [filteredCommands],
  )
  const documentsWithIndex = useMemo(
    () => recentDocuments.map((document, index) => ({ document, index: commandsWithIndex.length + index })),
    [recentDocuments, commandsWithIndex.length],
  )

  const invokeCommand = useCallback(
    (command: CommandItem) => {
      if (command.id === 'new-note') {
        onCreateNote()
        return
      }
      if (command.id === 'toggle-search') {
        onToggleSearch()
        onClose()
        return
      }
      if (command.documentId) {
        onOpenDocument(command.documentId)
        onClose()
      }
    },
    [onClose, onCreateNote, onOpenDocument, onToggleSearch],
  )

  const activateRow = useCallback(
    (row: PaletteRow | undefined) => {
      if (!row) return
      if (row.kind === 'command') {
        invokeCommand(row.item)
      } else {
        onOpenDocument(row.item.id)
        onClose()
      }
    },
    [invokeCommand, onClose, onOpenDocument],
  )

  const handleKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      activateRow(rows[activeIndex])
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(rows.length - 1)
    }
  }

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const activeEl = container.querySelector<HTMLElement>('[data-active="true"]')
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="command-overlay fade-in" role="presentation" onClick={onClose}>
      <section
        className="command-palette pop-in"
        aria-label="Quick switcher"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKey}
      >
        <div className="command-palette__header">
          <div>
            <p className="eyebrow">
              <CommandIcon size={12} /> Quick switcher
            </p>
            <h3>Jump without leaving the keyboard</h3>
          </div>
          <button type="button" className="search-panel__close" onClick={onClose}>
            Esc
          </button>
        </div>

        <label className="search-panel__input search-panel__input--inline">
          <span className="search-panel__input-icon">
            <SearchIcon size={16} />
          </span>
          <input
            type="search"
            placeholder="Open note, create draft, jump to graph..."
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <span className="search-panel__input-hint">
            <Keyboard size={12} /> ↑↓ to browse · <CornerDownLeft size={12} /> to open
          </span>
        </label>

        <div className="command-palette__sections" ref={listRef}>
          {rows.length === 0 ? (
            <div className="search-panel__empty">
              <SearchX size={22} />
              <strong>No matches for “{query}”</strong>
              <p>Try a different phrase, or create a new note.</p>
              <button type="button" className="chip-button chip-button--accent" onClick={onCreateNote}>
                <FilePlus2 size={14} /> Create “{query || 'Untitled'}”
              </button>
            </div>
          ) : (
            <>
              {filteredCommands.length ? (
                <section>
                  <p className="search-panel__group-label">
                    <CommandIcon size={12} /> Commands
                  </p>
                  <div className="search-panel__items">
                    {commandsWithIndex.map(({ command, index: localIndex }) => {
                      const isActive = activeIndex === localIndex
                      return (
                        <button
                          key={command.id}
                          type="button"
                          data-active={isActive || undefined}
                          className={`search-result${isActive ? ' search-result--active' : ''}`}
                          onMouseEnter={() => setActiveIndex(localIndex)}
                          onClick={() => invokeCommand(command)}
                        >
                          <span className="search-result__icon">
                            {command.id === 'new-note' ? (
                              <FilePlus2 size={14} />
                            ) : command.id === 'toggle-search' ? (
                              <SearchIcon size={14} />
                            ) : (
                              <FileText size={14} />
                            )}
                          </span>
                          <strong>{command.label}</strong>
                          <span>{command.hint}</span>
                          <code>{command.shortcut}</code>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}

              {recentDocuments.length ? (
                <section>
                  <p className="search-panel__group-label">
                    <FileText size={12} /> Open notes
                  </p>
                  <div className="search-panel__items">
                    {documentsWithIndex.map(({ document, index: localIndex }) => {
                      const isActive = activeIndex === localIndex
                      return (
                        <button
                          key={document.id}
                          type="button"
                          data-active={isActive || undefined}
                          className={`search-result${isActive ? ' search-result--active' : ''}`}
                          onMouseEnter={() => setActiveIndex(localIndex)}
                          onClick={() => {
                            onOpenDocument(document.id)
                            onClose()
                          }}
                        >
                          <span className="search-result__icon">
                            <FileText size={14} />
                          </span>
                          <strong>{document.title}</strong>
                          <span>{document.path}</span>
                          <code>{document.updatedAt}</code>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

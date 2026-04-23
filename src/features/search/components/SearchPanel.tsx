import { useMemo, useState } from 'react'
import { FileText, Hash, Search as SearchIcon, SearchX, X } from 'lucide-react'
import type { SearchGroup } from '../../workspace/data/mockWorkspace'
import '../search.css'

type SearchPanelProps = {
  query: string
  groups: SearchGroup[]
  onQueryChange: (value: string) => void
  onClose: () => void
  onOpenDocument: (documentId: string) => void
}

export function SearchPanel({ query, groups, onQueryChange, onClose, onOpenDocument }: SearchPanelProps) {
  const flatResults = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ groupTitle: group.title, item }))),
    [groups],
  )

  const [activeIndex, setActiveIndex] = useState(0)
  const groupsWithIndex = useMemo(
    () =>
      groups.map((group) => ({
        title: group.title,
        indexedItems: group.items.map((item) => {
          const index = flatResults.findIndex((entry) => entry.item.id === item.id)
          return { item, index }
        }),
      })),
    [groups, flatResults],
  )

  const handleKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!flatResults.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, flatResults.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = flatResults[activeIndex]
      if (target?.item.documentId) {
        onOpenDocument(target.item.documentId)
      }
    }
  }

  return (
    <aside
      className="search-panel pop-in"
      aria-label="Workspace search"
      onKeyDown={handleKey}
    >
      <div className="search-panel__header">
        <div>
          <p className="eyebrow">
            <SearchIcon size={12} /> Search
          </p>
          <h3>Index and actions</h3>
        </div>
        <button type="button" className="search-panel__close" onClick={onClose} aria-label="Close search">
          <X size={14} />
        </button>
      </div>

      <label className="search-panel__input search-panel__input--inline">
        <span className="search-panel__input-icon">
          <SearchIcon size={16} />
        </span>
        <input
          type="search"
          placeholder='Try "project", "meeting", or #status'
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoFocus
        />
        {query ? (
          <button
            type="button"
            className="search-panel__clear"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        ) : null}
      </label>

      <div className="search-panel__groups">
        {!query.trim() ? (
          <div className="search-panel__hint">
            <SearchIcon size={22} />
            <strong>Search the whole vault</strong>
            <p>Type a phrase, a tag like <code>#status</code>, or a path fragment.</p>
          </div>
        ) : flatResults.length === 0 ? (
          <div className="search-panel__empty">
            <SearchX size={22} />
            <strong>No matches yet</strong>
            <p>Try different words or check spelling.</p>
          </div>
        ) : (
          groupsWithIndex.map((group) => (
            <section key={group.title}>
              <p className="search-panel__group-label">
                <Hash size={12} /> {group.title}
              </p>
              <div className="search-panel__items">
                {group.indexedItems.map(({ item, index: idx }) => {
                  const isActive = activeIndex === idx
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`search-result${isActive ? ' search-result--active' : ''}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => item.documentId && onOpenDocument(item.documentId)}
                    >
                      <span className="search-result__icon">
                        <FileText size={14} />
                      </span>
                      <strong>{item.label}</strong>
                      <span>{item.meta}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  )
}

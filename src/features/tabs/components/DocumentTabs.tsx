import { FileText, X } from 'lucide-react'
import type { WorkspaceDocument } from '../../workspace/data/mockWorkspace'
import '../tabs.css'

type DocumentTabsProps = {
  tabs: WorkspaceDocument[]
  activeTabId: string
  onSelect: (tabId: string) => void
  onClose?: (tabId: string) => void
}

export function DocumentTabs({ tabs, activeTabId, onSelect, onClose }: DocumentTabsProps) {
  if (!tabs.length) {
    return (
      <div className="tabs-strip tabs-strip--empty" role="tablist" aria-label="Open documents">
        <span className="tabs-strip__placeholder">
          <FileText size={14} />
          No notes open yet — use the tree or quick switcher.
        </span>
      </div>
    )
  }

  return (
    <div className="tabs-strip" role="tablist" aria-label="Open documents">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={`tab-chip${isActive ? ' tab-chip--active' : ''}${tab.unsaved ? ' tab-chip--unsaved' : ''}`}
          >
            <button
              type="button"
              className="tab-chip__surface"
              onClick={() => onSelect(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1 && onClose) {
                  event.preventDefault()
                  onClose(tab.id)
                }
              }}
              title={tab.path}
            >
              <FileText size={13} className="tab-chip__icon" />
              <span className="tab-chip__title">{tab.title}</span>
              <span className="tab-chip__meta">{tab.updatedAt}</span>
            </button>
            {tab.unsaved ? <span className="tab-chip__dot" aria-label="Unsaved changes" /> : null}
            {onClose ? (
              <button
                type="button"
                className="tab-chip__close"
                aria-label={`Close ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

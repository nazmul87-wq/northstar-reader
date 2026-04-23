import type { ComponentType, SVGProps } from 'react'
import {
  Blocks,
  FolderTree,
  Layout,
  Network,
  Search,
} from 'lucide-react'
import type { NavigationItem } from '../../workspace/data/mockWorkspace'
import '../navigation.css'

type NavigationRailProps = {
  items: NavigationItem[]
  activeItemId: string
  onSelect?: (itemId: string) => void
  onTriggerSearch?: () => void
}

const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  library: FolderTree,
  search: Search,
  graph: Network,
  canvas: Layout,
  plugins: Blocks,
}

export function NavigationRail({ items, activeItemId, onSelect, onTriggerSearch }: NavigationRailProps) {
  return (
    <section className="navigation-panel fade-up">
      <div className="navigation-panel__header">
        <div>
          <p className="eyebrow">Explore</p>
          <h3>Workspace rail</h3>
        </div>
        <span className="navigation-panel__pill">Windows-first</span>
      </div>

      <nav className="navigation-rail" aria-label="Primary views">
        {items.map((item, index) => {
          const isActive = item.id === activeItemId
          const Icon = ICONS[item.id] ?? FolderTree
          const isDisabled = Boolean(item.badge) && item.badge !== undefined && ['Soon', 'Future'].includes(item.badge)

          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              disabled={isDisabled && !onSelect}
              className={`rail-item${isActive ? ' rail-item--active' : ''}${isDisabled ? ' rail-item--soon' : ''}`}
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => {
                if (isDisabled) return
                onSelect?.(item.id)
                if (item.id === 'search') {
                  onTriggerSearch?.()
                }
              }}
            >
              <span className="rail-item__glyph" aria-hidden="true">
                <Icon width={16} height={16} />
              </span>
              <span className="rail-item__label">{item.label}</span>
              {item.badge ? <span className="rail-item__badge">{item.badge}</span> : null}
              {isActive ? <span className="rail-item__indicator" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </nav>
    </section>
  )
}

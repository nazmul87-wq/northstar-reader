import { ArrowUpRight, Link2, Sparkles } from 'lucide-react'
import type { BacklinkItem } from '../../workspace/data/mockWorkspace'
import '../inspector.css'

type BacklinksPanelProps = {
  backlinks: BacklinkItem[]
  onOpenDocument: (path: string) => void
}

export function BacklinksPanel({ backlinks, onOpenDocument }: BacklinksPanelProps) {
  return (
    <section className="inspector-card fade-up" style={{ animationDelay: '60ms' }}>
      <div className="inspector-card__header">
        <div>
          <p className="eyebrow">
            <Link2 size={12} /> Context
          </p>
          <h3>Backlinks</h3>
        </div>
        <span className="inspector-card__count">{backlinks.length}</span>
      </div>

      <div className="backlink-list">
        {backlinks.length ? (
          backlinks.map((link, index) => (
            <button
              key={`${link.path}-${link.source}`}
              type="button"
              className="backlink-item backlink-item--button"
              style={{ animationDelay: `${index * 60}ms` }}
              onClick={() => onOpenDocument(link.path)}
            >
              <div className="backlink-item__header">
                <span className="backlink-item__icon">
                  <Link2 size={13} />
                </span>
                <strong>{link.source}</strong>
                <span className="backlink-item__strength">{link.strength}</span>
                <span className="backlink-item__arrow" aria-hidden="true">
                  <ArrowUpRight size={14} />
                </span>
              </div>
              <p>{link.context}</p>
            </button>
          ))
        ) : (
          <article className="backlink-item backlink-item--empty">
            <Sparkles size={20} />
            <strong>No backlinks yet</strong>
            <p>Wiki-link other notes with <code>[[Note name]]</code> to see them here.</p>
          </article>
        )}
      </div>
    </section>
  )
}

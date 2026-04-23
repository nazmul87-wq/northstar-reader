import { useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Hash,
  Plug,
  Plus,
  Save,
  Tag,
  Trash2,
} from 'lucide-react'
import type { ActivityItem, PropertyGroup } from '../../workspace/data/mockWorkspace'
import '../inspector.css'

type PropertiesPanelProps = {
  properties: PropertyGroup[]
  activity: ActivityItem[]
  pluginHooks: ActivityItem[]
  tags: string[]
  onApply: (properties: Record<string, unknown>, tags: string[]) => void
}

export function PropertiesPanel({ properties, activity, pluginHooks, tags, onApply }: PropertiesPanelProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      properties.flatMap((group) => group.values).map((entry) => [entry.label, entry.value]),
    )
  )
  const [tagDraft, setTagDraft] = useState(tags.join(', '))
  const [newKey, setNewKey] = useState('')

  const tagList = tagDraft
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const handleAddProperty = () => {
    const label = newKey.trim()
    if (!label) return
    setDraft((current) => ({ ...current, [label]: current[label] ?? '' }))
    setNewKey('')
  }

  const handleRemoveProperty = (label: string) => {
    setDraft((current) => {
      const next = { ...current }
      delete next[label]
      return next
    })
  }

  return (
    <section className="inspector-card fade-up" style={{ animationDelay: '120ms' }}>
      <div className="inspector-card__header">
        <div>
          <p className="eyebrow">
            <Activity size={12} /> Inspector
          </p>
          <h3>Properties and hooks</h3>
        </div>
        <span className="inspector-card__count inspector-card__count--live">
          <span className="inspector-card__live-dot" aria-hidden="true" />
          Live
        </span>
      </div>

      <div className="property-groups">
        <section className="property-group">
          <h4>
            <Tag size={13} /> Editable frontmatter
          </h4>
          <div className="property-editor">
            {Object.entries(draft).length === 0 ? (
              <p className="property-editor__empty">No frontmatter yet — add a property below.</p>
            ) : null}
            {Object.entries(draft).map(([label, value]) => (
              <label key={label} className="property-editor__row">
                <span className="property-editor__label">
                  <Hash size={11} /> {label}
                  <button
                    type="button"
                    className="property-editor__remove"
                    aria-label={`Remove ${label}`}
                    onClick={() => handleRemoveProperty(label)}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
                <input
                  value={value}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [label]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}

            <label className="property-editor__row">
              <span className="property-editor__label">
                <Tag size={11} /> tags
              </span>
              <input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                placeholder="comma, separated, tags"
              />
            </label>

            {tagList.length ? (
              <div className="property-editor__tag-preview" aria-hidden="true">
                {tagList.map((tag) => (
                  <span key={tag} className="property-tag-chip">
                    <Hash size={10} />
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="property-editor__add">
              <input
                value={newKey}
                placeholder="Add property name (e.g. status)"
                onChange={(event) => setNewKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleAddProperty()
                  }
                }}
              />
              <button
                type="button"
                className="tree-panel__cta"
                disabled={!newKey.trim()}
                onClick={handleAddProperty}
              >
                <Plus size={13} /> Add
              </button>
            </div>

            <button
              type="button"
              className="chip-button chip-button--accent property-editor__apply"
              onClick={() =>
                onApply(
                  Object.entries(draft).reduce<Record<string, unknown>>((acc, [label, value]) => {
                    acc[label] = value.includes(',') ? value.split(',').map((item) => item.trim()) : value
                    return acc
                  }, {}),
                  tagList,
                )
              }
            >
              <Save size={14} />
              Apply properties
            </button>
          </div>
        </section>
      </div>

      <section className="property-group">
        <h4>
          <Activity size={13} /> Activity
        </h4>
        <div className="tag-list">
          {activity.map((item, index) => (
            <span
              key={`${item.label}-${index}`}
              className="tag-pill"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <CheckCircle2 size={11} />
              {item.label}
              <small>{item.meta}</small>
            </span>
          ))}
        </div>
      </section>

      <section className="property-group">
        <h4>
          <Plug size={13} /> Plugin surface
        </h4>
        <div className="plugin-hook-list">
          {pluginHooks.map((item) => (
            <article key={item.label} className="plugin-hook">
              <div className="plugin-hook__icon">
                <Plug size={14} />
              </div>
              <div>
                <strong>{item.label}</strong>
                <p>{item.meta}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

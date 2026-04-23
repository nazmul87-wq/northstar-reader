import { autocompletion } from '@codemirror/autocomplete'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useMemo, useState } from 'react'
import {
  Clock,
  Columns2,
  Eye,
  FileEdit,
  Loader2,
  Save,
  SquareStack,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { WorkspaceDocument } from '../../workspace/data/mockWorkspace'
import { decorateWikiLinks, findWikiToken, stripFrontmatter } from '../../../shared/lib/markdown'
import '../editor.css'

type EditorPreviewProps = {
  document: WorkspaceDocument
  linkSuggestions: Array<{ label: string; path: string }>
  isSaving?: boolean
  onChange: (content: string) => void
  onSave: () => void
  onOpenLink: (path: string) => void
}

function usePrefersDark() {
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return prefersDark
}

export function EditorPreview({
  document,
  linkSuggestions,
  isSaving = false,
  onChange,
  onSave,
  onOpenLink,
}: EditorPreviewProps) {
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const prefersDark = usePrefersDark()

  const extensions = useMemo(
    () => [
      markdown(),
      autocompletion({
        override: [
          (context) => {
            const token = findWikiToken(context.state.doc.toString(), context.pos)
            if (!token) {
              return null
            }

            return {
              from: token.from,
              options: linkSuggestions
                .filter((item) => item.label.toLowerCase().includes(token.query))
                .slice(0, 10)
                .map((item) => ({
                  label: item.label,
                  apply: `${item.label}]]`,
                  type: 'text',
                })),
            }
          },
        ],
      }),
    ],
    [linkSuggestions],
  )

  return (
    <div className={`editor-layout${previewEnabled ? '' : ' editor-layout--single'}`}>
      <section className="editor-pane" aria-label="Markdown editor">
        <div className="editor-pane__header">
          <div>
            <p className="eyebrow">
              <FileEdit size={12} /> Editor
            </p>
            <h3>Markdown source</h3>
          </div>
          <div className="editor-pane__actions">
            <button
              type="button"
              className={`editor-pane__button editor-pane__button--primary${isSaving ? ' editor-pane__button--busy' : ''}`}
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 size={14} className="editor-pane__spinner" />
              ) : (
                <Save size={14} />
              )}
              {isSaving ? 'Saving' : 'Save'}
            </button>
            <button
              type="button"
              className="editor-pane__button"
              onClick={() => setPreviewEnabled((value) => !value)}
              title={previewEnabled ? 'Switch to editor only' : 'Open split view'}
            >
              {previewEnabled ? <SquareStack size={14} /> : <Columns2 size={14} />}
              {previewEnabled ? 'Editor only' : 'Split view'}
            </button>
          </div>
        </div>

        <div className="editor-pane__body editor-pane__body--codemirror">
          <CodeMirror
            value={document.content}
            height="100%"
            theme={prefersDark ? oneDark : undefined}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
            onChange={onChange}
          />
        </div>
      </section>

      {previewEnabled ? (
        <section className="preview-pane" aria-label="Rendered preview">
          <div className="editor-pane__header">
            <div>
              <p className="eyebrow">
                <Eye size={12} /> Preview
              </p>
              <h3>Reading mode</h3>
            </div>
            <span className="preview-pane__badge">
              <Clock size={11} />
              {document.updatedAt}
            </span>
          </div>

          <div className="preview-pane__body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                a: ({ href, children }) => {
                  const target = href?.replace(/^wikilink:/, '')
                  if (target && href?.startsWith('wikilink:')) {
                    return (
                      <button
                        type="button"
                        className="preview-link"
                        onClick={() => onOpenLink(resolveTarget(target, linkSuggestions))}
                      >
                        {children}
                      </button>
                    )
                  }
                  return (
                    <a href={href} target="_blank" rel="noreferrer noopener">
                      {children}
                    </a>
                  )
                },
              }}
            >
              {decorateWikiLinks(stripFrontmatter(document.content))}
            </ReactMarkdown>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function resolveTarget(target: string, suggestions: Array<{ label: string; path: string }>) {
  const normalized = target.split('#')[0].trim().toLowerCase()
  return suggestions.find((item) => item.label.toLowerCase() === normalized)?.path ?? `${target}.md`
}

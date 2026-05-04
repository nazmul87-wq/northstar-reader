import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import {
  BookOpen,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  Highlighter,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { bakePdfAnnotations, downloadBytes } from '../features/reader/pdf'
import { formatMarkdownProgress, formatPdfProgress, getMarkdownProgressPercent } from '../features/reader/progress'
import {
  deleteLibraryFile,
  loadActiveFileId,
  loadLibrary,
  loadReadingPref,
  saveActiveFileId,
  saveLibraryFile,
  saveReadingPref,
} from '../features/reader/storage'
import type { PdfAnnotation, ReaderFile } from '../features/reader/types'
import './app-shell.css'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type PdfDocumentLike = Awaited<ReturnType<typeof getDocument>['promise']>
const ANNOTATION_COLORS = ['#ffd966', '#7edfa2', '#7ab8ff', '#f5a0d8', '#ffba7a', '#ff6b6b'] as const

function App() {
  const [library, setLibrary] = useState<ReaderFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentLike | null>(null)
  const [pdfDocFileId, setPdfDocFileId] = useState<string | null>(null)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfScale, setPdfScale] = useState(1.2)
  const [pdfMode, setPdfMode] = useState<'single' | 'continuous'>('continuous')
  const [markdownProgress, setMarkdownProgress] = useState(100)
  const [markdownDrafts, setMarkdownDrafts] = useState<Record<string, string>>({})
  const [pdfTool, setPdfTool] = useState<'highlight' | 'comment'>('highlight')
  const [pdfColor, setPdfColor] = useState<string>(ANNOTATION_COLORS[0])
  const [pdfCommentDraft, setPdfCommentDraft] = useState('')
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<string, string>>({})
  const [isBooting, setIsBooting] = useState(true)
  const [status, setStatus] = useState('Ready')
  const [isReaderFullscreen, setIsReaderFullscreen] = useState(false)
  const [dragRect, setDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number; page: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const continuousContainerRef = useRef<HTMLDivElement | null>(null)
  const viewerSurfaceRef = useRef<HTMLElement | null>(null)
  const readerMiddleRef = useRef<HTMLElement | null>(null)
  const singleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const hiddenImportRef = useRef<HTMLInputElement | null>(null)
  const hiddenFolderImportRef = useRef<HTMLInputElement | null>(null)
  const lastContinuousScrollRef = useRef(0)
  const commentDebounceRef = useRef<number | null>(null)
  const dragBoundsRef = useRef<DOMRect | null>(null)

  const activeFile = useMemo(
    () => library.find((item) => item.id === activeFileId) ?? null,
    [library, activeFileId],
  )
  const activePdfDoc = activeFile?.kind === 'pdf' && pdfDocFileId === activeFile.id ? pdfDoc : null
  const activeFileKind = activeFile?.kind ?? null
  const effectiveSelectedAnnotationId = useMemo(() => {
    if (activeFile?.kind !== 'pdf') {
      return null
    }
    if (selectedAnnotationId && activeFile.annotations.some((item) => item.id === selectedAnnotationId)) {
      return selectedAnnotationId
    }
    return activeFile.annotations[0]?.id ?? null
  }, [activeFile, selectedAnnotationId])

  const selectedAnnotation = useMemo(() => {
    if (activeFile?.kind !== 'pdf') {
      return null
    }
    if (!effectiveSelectedAnnotationId) {
      return null
    }
    return activeFile.annotations.find((item) => item.id === effectiveSelectedAnnotationId) ?? null
  }, [activeFile, effectiveSelectedAnnotationId])

  const activeContinuousAnnotations = useMemo(
    () => (activeFile?.kind === 'pdf' ? activeFile.annotations : []),
    [activeFile],
  )
  const activeAnnotationDraft = selectedAnnotation
    ? annotationDrafts[selectedAnnotation.id] ?? selectedAnnotation.comment
    : ''

  const updateMarkdownProgress = useCallback(() => {
    const viewer = viewerSurfaceRef.current
    setMarkdownProgress(
      getMarkdownProgressPercent(
        viewer
          ? {
              scrollTop: viewer.scrollTop,
              scrollHeight: viewer.scrollHeight,
              clientHeight: viewer.clientHeight,
            }
          : null,
      ),
    )
  }, [])

  const readingProgressLabel = useMemo(() => {
    if (activeFile?.kind === 'pdf') {
      return formatPdfProgress(pdfPage, activePdfDoc?.numPages ?? 0)
    }

    if (activeFile?.kind === 'markdown') {
      return formatMarkdownProgress(markdownProgress)
    }

    return null
  }, [activeFile?.kind, activePdfDoc?.numPages, markdownProgress, pdfPage])

  useEffect(() => {
    void (async () => {
      try {
        const files = await loadLibrary()
        setLibrary(files)
        const remembered = loadActiveFileId()
        const fallbackId = files[0]?.id ?? null
        setActiveFileId(remembered && files.some((file) => file.id === remembered) ? remembered : fallbackId)
      } finally {
        setIsBooting(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!activeFile || activeFile.kind !== 'pdf' || !activeFile.pdfBytes) {
      return
    }

    let isCurrent = true
    const pdfBytes = activeFile.pdfBytes
    const fileId = activeFile.id

    void (async () => {
      // Pass a copy to pdf.js so app state bytes are not detached.
      const task = getDocument({ data: pdfBytes.slice() })
      const loaded = (await task.promise) as unknown as PdfDocumentLike
      if (isCurrent) {
        setPdfDoc(loaded)
        setPdfDocFileId(fileId)
      }
    })()

    return () => {
      isCurrent = false
    }
  }, [activeFile])

  useEffect(() => {
    if (!activeFileId) {
      return
    }
    void (async () => {
      const pref = await loadReadingPref(activeFileId)
      if (!pref) {
        setPdfPage(1)
        setPdfScale(1.2)
        return
      }
      setPdfPage(pref.pdfPage ?? 1)
      setPdfScale(pref.pdfScale ?? 1.2)
    })()
  }, [activeFileId])

  useEffect(() => {
    if (!activeFile || activeFile.kind !== 'pdf') {
      return
    }
    void saveReadingPref({
      fileId: activeFile.id,
      pdfPage,
      pdfScale,
    })
  }, [activeFile, pdfPage, pdfScale])

  useEffect(() => {
    if (!hiddenFolderImportRef.current) {
      return
    }
    hiddenFolderImportRef.current.setAttribute('webkitdirectory', '')
    hiddenFolderImportRef.current.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    saveActiveFileId(activeFileId)
  }, [activeFileId])

  useEffect(() => {
    if (activeFile?.kind !== 'markdown') {
      return
    }

    const frame = requestAnimationFrame(updateMarkdownProgress)
    return () => cancelAnimationFrame(frame)
  }, [activeFile, updateMarkdownProgress])

  useEffect(() => {
    const syncReaderFullscreen = () => {
      const el = readerMiddleRef.current
      const doc = document as Document & { webkitFullscreenElement?: Element | null }
      setIsReaderFullscreen(el != null && (document.fullscreenElement === el || doc.webkitFullscreenElement === el))
    }
    document.addEventListener('fullscreenchange', syncReaderFullscreen)
    document.addEventListener('webkitfullscreenchange', syncReaderFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', syncReaderFullscreen)
      document.removeEventListener('webkitfullscreenchange', syncReaderFullscreen)
    }
  }, [])

  useEffect(() => {
    if (!activePdfDoc || activeFileKind !== 'pdf') {
      return
    }
    if (pdfMode === 'single') {
      void renderPdfPage(activePdfDoc, pdfPage, pdfScale, singleCanvasRef.current)
      return
    }

    const viewer = viewerSurfaceRef.current
    if (viewer) {
      lastContinuousScrollRef.current = viewer.scrollTop
    }
    void renderContinuous(
      activePdfDoc,
      pdfScale,
      continuousContainerRef.current,
      activeContinuousAnnotations,
      effectiveSelectedAnnotationId,
    )
    requestAnimationFrame(() => {
      if (viewer) {
        viewer.scrollTop = lastContinuousScrollRef.current
      }
    })
  }, [
    activePdfDoc,
    pdfPage,
    pdfScale,
    pdfMode,
    activeFileId,
    activeFileKind,
    activeContinuousAnnotations,
    effectiveSelectedAnnotationId,
  ])

  useEffect(() => {
    if (pdfMode !== 'continuous') {
      return
    }
    updateContinuousOverlays(
      continuousContainerRef.current,
      activeContinuousAnnotations,
      effectiveSelectedAnnotationId,
    )
  }, [pdfMode, activeContinuousAnnotations, effectiveSelectedAnnotationId])

  useEffect(
    () => () => {
      if (commentDebounceRef.current) {
        window.clearTimeout(commentDebounceRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (commentDebounceRef.current) {
      window.clearTimeout(commentDebounceRef.current)
      commentDebounceRef.current = null
    }
  }, [activeFileId])

  function setActiveFile(fileId: string) {
    setActiveFileId(fileId)
    setStatus('Opened')
  }

  async function toggleReaderFullscreen() {
    const el = readerMiddleRef.current
    if (!el) {
      return
    }
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null
      webkitExitFullscreen?: () => Promise<void>
    }
    const elWk = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
    try {
      const inFs = document.fullscreenElement === el || doc.webkitFullscreenElement === el
      if (inFs) {
        if (document.fullscreenElement) {
          await document.exitFullscreen()
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen()
        }
        return
      }
      if (el.requestFullscreen) {
        await el.requestFullscreen()
        return
      }
      if (elWk.webkitRequestFullscreen) {
        await Promise.resolve(elWk.webkitRequestFullscreen())
      }
    } catch {
      setStatus('Full screen is not available in this environment')
    }
  }

  async function upsertFiles(files: ReaderFile[]) {
    for (const file of files) {
      await saveLibraryFile(file)
    }
    setLibrary((current) => {
      const map = new Map(current.map((item) => [item.id, item]))
      for (const file of files) {
        map.set(file.id, file)
      }
      return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt)
    })
    if (files[0]) {
      setActiveFileId(files[0].id)
    }
    setStatus(`${files.length} file(s) imported`)
  }

  async function importFromSelection(list: FileList | null) {
    if (!list?.length) {
      return
    }
    const imported: ReaderFile[] = []
    const baseStamp = (library[0]?.updatedAt ?? 0) + 1
    for (const [index, rawFile] of Array.from(list).entries()) {
      const lower = rawFile.name.toLowerCase()
      const id = `${rawFile.name}-${rawFile.lastModified}-${rawFile.size}`
      const stamp = rawFile.lastModified || baseStamp + index
      if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
        imported.push({
          id,
          name: rawFile.webkitRelativePath || rawFile.name,
          kind: 'markdown',
          markdownText: await rawFile.text(),
          annotations: [],
          createdAt: stamp,
          updatedAt: stamp,
        })
        continue
      }
      if (lower.endsWith('.pdf')) {
        imported.push({
          id,
          name: rawFile.webkitRelativePath || rawFile.name,
          kind: 'pdf',
          pdfBytes: new Uint8Array(await rawFile.arrayBuffer()),
          annotations: [],
          createdAt: stamp,
          updatedAt: stamp,
        })
      }
    }
    if (!imported.length) {
      setStatus('No supported files found')
      return
    }
    await upsertFiles(imported)
  }

  async function removeLibraryItem(fileId: string) {
    const ok = window.confirm('Delete this item from the left panel library?')
    if (!ok) {
      return
    }
    await deleteLibraryFile(fileId)
    setLibrary((current) => current.filter((item) => item.id !== fileId))
    setActiveFileId((current) => {
      if (current !== fileId) {
        return current
      }
      const next = library.find((item) => item.id !== fileId)
      return next?.id ?? null
    })
    setStatus('Removed from library')
  }

  const activeMarkdownDraft = activeFile?.kind === 'markdown'
    ? (markdownDrafts[activeFile.id] ?? activeFile.markdownText ?? '')
    : ''

  async function saveMarkdownChanges() {
    if (!activeFile || activeFile.kind !== 'markdown') {
      return
    }
    const nextText = markdownDrafts[activeFile.id] ?? activeFile.markdownText ?? ''
    const updated: ReaderFile = {
      ...activeFile,
      markdownText: nextText,
      updatedAt: activeFile.updatedAt + 1,
    }
    await saveLibraryFile(updated)
    setLibrary((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    const bytes = new TextEncoder().encode(nextText)
    downloadBytes(activeFile.name.replace(/\.md$/i, '.md'), bytes, 'text/markdown')
    setStatus('Markdown saved (downloaded)')
  }

  async function savePdfWithAnnotations() {
    if (!activeFile || activeFile.kind !== 'pdf' || !activeFile.pdfBytes) {
      return
    }
    const merged = await bakePdfAnnotations(activeFile.pdfBytes, activeFile.annotations)
    const updated: ReaderFile = {
      ...activeFile,
      pdfBytes: merged,
      updatedAt: activeFile.updatedAt + 1,
    }
    await saveLibraryFile(updated)
    setLibrary((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    const fileName = activeFile.name.replace(/\.pdf$/i, '') + '.annotated.pdf'
    downloadBytes(fileName, merged, 'application/pdf')
    setStatus('PDF annotations baked and downloaded')
  }

  async function addAnnotation(rect: { x: number; y: number; width: number; height: number }) {
    if (!activeFile || activeFile.kind !== 'pdf' || !dragStart) {
      return
    }
    const note: PdfAnnotation = {
      id: crypto.randomUUID(),
      page: dragStart.page,
      x: Math.max(0, Math.min(rect.x, 1)),
      y: Math.max(0, Math.min(rect.y, 1)),
      width: Math.max(0, Math.min(rect.width, 1 - rect.x)),
      height: Math.max(0, Math.min(rect.height, 1 - rect.y)),
      kind: pdfTool,
      comment: pdfTool === 'comment' ? pdfCommentDraft.trim() : '',
      color: pdfColor,
      createdAt: activeFile.updatedAt + activeFile.annotations.length + 1,
    }

    const updated: ReaderFile = {
      ...activeFile,
      annotations: [...activeFile.annotations, note],
      updatedAt: activeFile.updatedAt + 1,
    }
    await saveLibraryFile(updated)
    setLibrary((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    setSelectedAnnotationId(note.id)
    setPdfCommentDraft('')
    setAnnotationDrafts((current) => ({ ...current, [note.id]: note.comment }))
    setStatus('Annotation added')
  }

  async function updateAnnotation(annotationId: string, changes: Partial<PdfAnnotation>, quiet = false) {
    if (!activeFile || activeFile.kind !== 'pdf') {
      return
    }
    const updated: ReaderFile = {
      ...activeFile,
      annotations: activeFile.annotations.map((item) =>
        item.id === annotationId ? { ...item, ...changes, updatedAt: activeFile.updatedAt + 1 } : item,
      ),
      updatedAt: activeFile.updatedAt + 1,
    }
    await saveLibraryFile(updated)
    setLibrary((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    if (!quiet) {
      setStatus('Annotation updated')
    }
  }

  function queueCommentPersist(fileId: string, annotationId: string, value: string) {
    if (commentDebounceRef.current) {
      window.clearTimeout(commentDebounceRef.current)
    }
    commentDebounceRef.current = window.setTimeout(() => {
      if (activeFile?.id !== fileId) {
        commentDebounceRef.current = null
        return
      }
      void updateAnnotation(annotationId, { comment: value }, true)
      commentDebounceRef.current = null
    }, 220)
  }

  function onPointerDownForPage(
    event: PointerEvent<HTMLElement>,
    page: number,
    targetElement?: HTMLElement | null,
  ) {
    if (event.button !== 0) {
      return
    }
    if (!activeFile || activeFile.kind !== 'pdf') {
      return
    }
    const host = targetElement ?? (event.currentTarget as HTMLElement | null)
    if (!host) {
      return
    }
    event.preventDefault()
    host.setPointerCapture(event.pointerId)
    const bounds = host.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width
    const y = (event.clientY - bounds.top) / bounds.height
    setDragStart({ x, y, page })
    dragBoundsRef.current = bounds
    setDragRect(null)
  }

  function onPointerMoveForPage(event: PointerEvent<HTMLElement>) {
    if (!dragStart || !dragBoundsRef.current) {
      return
    }
    event.preventDefault()
    const bounds = dragBoundsRef.current
    const x = (event.clientX - bounds.left) / bounds.width
    const y = (event.clientY - bounds.top) / bounds.height
    const rect = {
      x: Math.min(dragStart.x, x),
      y: Math.min(dragStart.y, y),
      width: Math.abs(x - dragStart.x),
      height: Math.abs(y - dragStart.y),
    }
    setDragRect(rect)
  }

  function onPointerUpForPage(event?: PointerEvent<HTMLElement>) {
    const host = event?.currentTarget as HTMLElement | undefined
    if (host && event && host.hasPointerCapture(event.pointerId)) {
      host.releasePointerCapture(event.pointerId)
    }
    if (!dragStart) {
      setDragRect(null)
      dragBoundsRef.current = null
      return
    }
    let finalRect = dragRect
    if (event && dragBoundsRef.current) {
      const bounds = dragBoundsRef.current
      const x = (event.clientX - bounds.left) / bounds.width
      const y = (event.clientY - bounds.top) / bounds.height
      finalRect = {
        x: Math.min(dragStart.x, x),
        y: Math.min(dragStart.y, y),
        width: Math.abs(x - dragStart.x),
        height: Math.abs(y - dragStart.y),
      }
    }
    if (!finalRect || finalRect.width < 0.01 || finalRect.height < 0.01) {
      const clickRect = centeredRect(dragStart.x, dragStart.y, 0.035, 0.028)
      setDragStart(null)
      setDragRect(null)
      dragBoundsRef.current = null
      void addAnnotation(clickRect)
      return
    }
    void addAnnotation(finalRect)
    setDragStart(null)
    setDragRect(null)
    dragBoundsRef.current = null
  }

  function onPointerCancelForPage(event?: PointerEvent<HTMLElement>) {
    const host = event?.currentTarget as HTMLElement | undefined
    if (host && event && host.hasPointerCapture(event.pointerId)) {
      host.releasePointerCapture(event.pointerId)
    }
    setDragStart(null)
    setDragRect(null)
    dragBoundsRef.current = null
  }

  function onContinuousPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement | null)?.closest('.pdf-canvas-wrap') as HTMLDivElement | null
    if (!target) {
      return
    }
    const page = Number(target.dataset.page ?? '0')
    if (page < 1) {
      return
    }
    onPointerDownForPage(event as unknown as PointerEvent<HTMLElement>, page, target)
  }

  function onContinuousPointerMove(event: PointerEvent<HTMLDivElement>) {
    onPointerMoveForPage(event as unknown as PointerEvent<HTMLElement>)
  }

  function onContinuousPointerUp(event: PointerEvent<HTMLDivElement>) {
    onPointerUpForPage(event as unknown as PointerEvent<HTMLElement>)
  }

  function onContinuousPointerCancel(event: PointerEvent<HTMLDivElement>) {
    onPointerCancelForPage(event as unknown as PointerEvent<HTMLElement>)
  }

  function onPdfWheel(event: React.WheelEvent<HTMLElement>) {
    if (activeFile?.kind !== 'pdf') {
      return
    }
    const viewer = viewerSurfaceRef.current
    if (!viewer) {
      return
    }
    const nextScroll = viewer.scrollTop + event.deltaY
    const maxScroll = Math.max(0, viewer.scrollHeight - viewer.clientHeight)
    const clamped = Math.max(0, Math.min(maxScroll, nextScroll))
    if (clamped === viewer.scrollTop) {
      return
    }
    event.preventDefault()
    viewer.scrollTop = clamped
  }

  function selectNewAnnotationColor(color: string) {
    setPdfColor(color)
    setStatus(`Draw color set to ${color}`)
  }

  async function removeAnnotation(id: string) {
    if (!activeFile || activeFile.kind !== 'pdf') {
      return
    }
    if (!window.confirm('Delete this annotation?')) {
      return
    }
    const updated: ReaderFile = {
      ...activeFile,
      annotations: activeFile.annotations.filter((item) => item.id !== id),
      updatedAt: activeFile.updatedAt + 1,
    }
    await saveLibraryFile(updated)
    setLibrary((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    setSelectedAnnotationId((current) => (current === id ? updated.annotations[0]?.id ?? null : current))
    setAnnotationDrafts((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  if (isBooting) {
    return <div className="reader-loading">Loading Northstar...</div>
  }

  return (
    <div className="reader-shell">
      <aside className="reader-left">
        <div className="panel-head">
          <h1>Northstar</h1>
          <span>Local library</span>
        </div>
        <div className="left-actions">
          <button type="button" className="btn-primary" onClick={() => hiddenImportRef.current?.click()}>
            <FileUp size={15} strokeWidth={1.75} />
            Import files
          </button>
          <button type="button" className="btn-secondary" onClick={() => hiddenFolderImportRef.current?.click()}>
            <FolderOpen size={15} strokeWidth={1.75} />
            Import folder
          </button>
          <input
            ref={hiddenImportRef}
            type="file"
            accept=".md,.markdown,.pdf"
            multiple
            className="hidden-input"
            onChange={(event) => {
              void importFromSelection(event.target.files)
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={hiddenFolderImportRef}
            type="file"
            multiple
            className="hidden-input"
            onChange={(event) => {
              void importFromSelection(event.target.files)
              event.currentTarget.value = ''
            }}
          />
        </div>
        <div className="library-list" role="tree" aria-label="Imported files">
          {library.length ? (
            library.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`library-item${file.id === activeFileId ? ' library-item--active' : ''}`}
                onClick={() => setActiveFile(file.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  void removeLibraryItem(file.id)
                }}
              >
                <span className="library-item__icon">
                  {file.kind === 'pdf' ? <BookOpen size={14} strokeWidth={1.75} /> : <FileText size={14} strokeWidth={1.75} />}
                </span>
                <span className="library-item__name" title={file.name}>
                  {file.name}
                </span>
              </button>
            ))
          ) : (
            <p className="empty-block">Import local .md or .pdf files to begin.</p>
          )}
        </div>
      </aside>

      <main ref={readerMiddleRef} className="reader-middle">
        <div className="panel-head panel-head--middle">
          <div>
            <h2>{activeFile?.name ?? 'No file selected'}</h2>
            <span>{status}</span>
          </div>
          {activeFile?.kind === 'pdf' || activeFile?.kind === 'markdown' ? (
            <div className="pdf-tools">
              {readingProgressLabel ? <span className="reading-progress-label">{readingProgressLabel}</span> : null}
              {activeFile.kind === 'pdf' ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pdfMode === 'continuous'}
                    title={pdfMode === 'continuous' ? 'Scroll the document in Book scroll mode' : 'Previous page'}
                    onClick={() => setPdfPage((prev) => Math.max(1, prev - 1))}
                  >
                    <Minus size={14} strokeWidth={1.75} />
                    Prev
                  </button>
                  <span>
                    {pdfPage}/{activePdfDoc?.numPages ?? 0}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pdfMode === 'continuous'}
                    title={pdfMode === 'continuous' ? 'Scroll the document in Book scroll mode' : 'Next page'}
                    onClick={() => setPdfPage((prev) => Math.min(activePdfDoc?.numPages ?? prev, prev + 1))}
                  >
                    <Plus size={14} strokeWidth={1.75} />
                    Next
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setPdfScale((prev) => Math.max(0.8, prev - 0.1))}>
                    Zoom -
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setPdfScale((prev) => Math.min(2.4, prev + 0.1))}>
                    Zoom +
                  </button>
                  <select value={pdfMode} onChange={(event) => setPdfMode(event.target.value as 'single' | 'continuous')}>
                    <option value="single">Single</option>
                    <option value="continuous">Book scroll</option>
                  </select>
                </>
              ) : null}
              <button
                type="button"
                className={`btn-secondary${isReaderFullscreen ? ' is-active' : ''}`}
                onClick={() => void toggleReaderFullscreen()}
                title={isReaderFullscreen ? 'Exit full screen (Esc)' : 'Full screen (Esc to exit)'}
              >
                {isReaderFullscreen ? <Minimize2 size={14} strokeWidth={1.75} /> : <Maximize2 size={14} strokeWidth={1.75} />}
                {isReaderFullscreen ? 'Exit full screen' : 'Full screen'}
              </button>
            </div>
          ) : null}
        </div>

        <section
          className="viewer-surface"
          ref={viewerSurfaceRef}
          onScroll={() => {
            if (activeFile?.kind === 'markdown') {
              updateMarkdownProgress()
            }
          }}
        >
          {activeFile?.kind === 'markdown' ? (
            <div className="markdown-view">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {activeFile.markdownText ?? ''}
              </ReactMarkdown>
            </div>
          ) : null}

          {activeFile?.kind === 'pdf' ? (
            <div className="pdf-view" onWheel={onPdfWheel}>
              {pdfMode === 'single' ? (
                <div
                  className="pdf-canvas-wrap"
                  ref={overlayRef}
                  onPointerDown={(event) => onPointerDownForPage(event as unknown as PointerEvent<HTMLElement>, pdfPage)}
                  onPointerMove={(event) => onPointerMoveForPage(event as unknown as PointerEvent<HTMLElement>)}
                  onPointerUp={(event) => onPointerUpForPage(event as unknown as PointerEvent<HTMLElement>)}
                  onPointerCancel={(event) => onPointerCancelForPage(event as unknown as PointerEvent<HTMLElement>)}
                >
                  <canvas ref={singleCanvasRef} />
                  <PdfAnnotationOverlay
                    annotations={activeFile.annotations}
                    page={pdfPage}
                    onSelectAnnotation={setSelectedAnnotationId}
                  />
                  {dragRect ? <AnnotationDraftRect rect={dragRect} /> : null}
                </div>
              ) : null}

              {pdfMode === 'continuous' ? (
                <div
                  className="pdf-continuous"
                  ref={continuousContainerRef}
                  onPointerDown={onContinuousPointerDown}
                  onPointerMove={onContinuousPointerMove}
                  onPointerUp={onContinuousPointerUp}
                  onPointerCancel={onContinuousPointerCancel}
                  onClick={(event) => {
                    const mark = (event.target as HTMLElement | null)?.closest('.annotation-mark') as HTMLElement | null
                    const annotationId = mark?.dataset.annotationId
                    if (annotationId) {
                      setSelectedAnnotationId(annotationId)
                    }
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {!activeFile ? <p className="empty-block">Select a file from the left panel.</p> : null}
        </section>
      </main>

      <aside className="reader-right">
        <div className="panel-head">
          <h3>Edit</h3>
          <span>Right panel tools</span>
        </div>

        {activeFile?.kind === 'markdown' ? (
          <div className="edit-panel edit-panel--markdown">
            <label htmlFor="markdown-editor">Markdown source</label>
            <textarea
              id="markdown-editor"
              className="markdown-editor-textarea"
              value={activeMarkdownDraft}
              onChange={(event) =>
                setMarkdownDrafts((current) => ({
                  ...current,
                  [activeFile.id]: event.target.value,
                }))
              }
              spellCheck={false}
            />
            <button type="button" className="btn-primary" onClick={() => void saveMarkdownChanges()}>
              <Download size={14} />
              Save markdown
            </button>
          </div>
        ) : null}

        {activeFile?.kind === 'pdf' ? (
          <div className="edit-panel">
            <label>Annotation tool</label>
            <div className="tool-row">
              <button
                type="button"
                className={`btn-secondary${pdfTool === 'highlight' ? ' is-active' : ''}`}
                onClick={() => setPdfTool('highlight')}
              >
                <Highlighter size={14} strokeWidth={1.75} />
                Marker
              </button>
              <button
                type="button"
                className={`btn-secondary${pdfTool === 'comment' ? ' is-active' : ''}`}
                onClick={() => setPdfTool('comment')}
              >
                <MessageSquarePlus size={14} strokeWidth={1.75} />
                Comment
              </button>
            </div>
            <div className="editor-section">
              <label>New annotation color</label>
              <div className="color-row">
                {ANNOTATION_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-chip${pdfColor === color ? ' color-chip--active' : ''}`}
                    style={{ background: color }}
                    onClick={() => selectNewAnnotationColor(color)}
                    aria-label={`Set annotation color ${color}`}
                  />
                ))}
              </div>
            </div>
            {pdfTool === 'comment' ? (
              <>
                <label htmlFor="pdf-comment">Comment text</label>
                <textarea
                  id="pdf-comment"
                  value={pdfCommentDraft}
                  onChange={(event) => setPdfCommentDraft(event.target.value)}
                  placeholder="Comment is attached after drag-selecting an area."
                />
              </>
            ) : null}
            <p className="hint">
              Pick any color chip, then click or drag on the PDF to write in that color.
            </p>
            <div className="annotation-list">
              {activeFile.annotations.length ? (
                activeFile.annotations.map((note) => (
                  <div
                    key={note.id}
                    className={`annotation-item${effectiveSelectedAnnotationId === note.id ? ' annotation-item--active' : ''}`}
                    onClick={() => {
                      setSelectedAnnotationId(note.id)
                      setPdfColor(note.color)
                      setPdfCommentDraft(note.comment)
                      setPdfTool(note.kind)
                    }}
                  >
                    <div>
                      <strong>
                        <span className="annotation-swatch" style={{ background: note.color }} />
                        Page {note.page}
                      </strong>
                      <p>{note.comment || (note.kind === 'comment' ? 'Comment' : 'Highlight')}</p>
                      <span className="annotation-meta">
                        <span>{note.kind}</span>
                        <span>
                          area {Math.round(note.width * 100)} x {Math.round(note.height * 100)}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        void removeAnnotation(note.id)
                      }}
                      aria-label="Delete annotation"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-block">No annotations yet.</p>
              )}
            </div>
            {selectedAnnotation ? (
              <div className="editor-section">
                <label>Edit selected annotation</label>
                <div className="row-inline">
                  <button
                    type="button"
                    className={`btn-secondary${selectedAnnotation.kind === 'highlight' ? ' is-active' : ''}`}
                    onClick={() => void updateAnnotation(selectedAnnotation.id, { kind: 'highlight' }, true)}
                  >
                    Highlight
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary${selectedAnnotation.kind === 'comment' ? ' is-active' : ''}`}
                    onClick={() => void updateAnnotation(selectedAnnotation.id, { kind: 'comment' }, true)}
                  >
                    Comment
                  </button>
                </div>
                <label>Selected annotation color</label>
                <div className="color-row">
                  {ANNOTATION_COLORS.map((color) => (
                    <button
                      key={`edit-${color}`}
                      type="button"
                      className={`color-chip${selectedAnnotation.color === color ? ' color-chip--active' : ''}`}
                      style={{ background: color }}
                      onClick={() => {
                        selectNewAnnotationColor(color)
                        void updateAnnotation(selectedAnnotation.id, { color }, true)
                      }}
                    />
                  ))}
                </div>
                <textarea
                  value={activeAnnotationDraft}
                  onChange={(event) => {
                    const value = event.target.value
                    setAnnotationDrafts((current) => ({ ...current, [selectedAnnotation.id]: value }))
                    void queueCommentPersist(activeFile.id, selectedAnnotation.id, value)
                  }}
                  placeholder="Annotation comment"
                />
              </div>
            ) : null}
            <button type="button" className="btn-primary" onClick={() => void savePdfWithAnnotations()}>
              <Download size={14} strokeWidth={1.75} />
              Save PDF with annotations
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function AnnotationDraftRect({ rect }: { rect: { x: number; y: number; width: number; height: number } }) {
  return (
    <div
      className="annotation-draft"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
    />
  )
}

function PdfAnnotationOverlay({
  annotations,
  page,
  onSelectAnnotation,
}: {
  annotations: PdfAnnotation[]
  page: number
  onSelectAnnotation: (annotationId: string) => void
}) {
  return (
    <div className="annotation-overlay">
      {annotations
        .filter((item) => item.page === page)
        .map((item) => (
          <div
            key={item.id}
            className="annotation-mark"
            data-annotation-id={item.id}
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.width * 100}%`,
              height: `${item.height * 100}%`,
              background: `${item.color}55`,
              borderColor: item.color,
            }}
            title={item.comment}
            onClick={(event) => {
              event.stopPropagation()
              onSelectAnnotation(item.id)
            }}
          />
        ))}
    </div>
  )
}

async function renderPdfPage(
  pdfDoc: PdfDocumentLike,
  pageNumber: number,
  scale: number,
  canvas: HTMLCanvasElement | null,
) {
  if (!canvas || pageNumber > pdfDoc.numPages || pageNumber < 1) {
    return
  }
  const page = await pdfDoc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, canvasContext: context, viewport }).promise
}

async function renderContinuous(
  pdfDoc: PdfDocumentLike,
  scale: number,
  container: HTMLDivElement | null,
  annotations: PdfAnnotation[],
  selectedAnnotationId: string | null,
) {
  if (!container) {
    return
  }
  const requiredPages = pdfDoc.numPages

  for (let index = 1; index <= requiredPages; index += 1) {
    const existing = container.querySelector<HTMLDivElement>(`.pdf-canvas-wrap[data-page="${index}"]`)
    if (existing) {
      continue
    }
    const wrap = document.createElement('div')
    wrap.className = 'pdf-canvas-wrap'
    wrap.dataset.page = String(index)
    const canvas = document.createElement('canvas')
    wrap.append(canvas)
    const layer = document.createElement('div')
    layer.className = 'annotation-overlay'
    wrap.append(layer)
    container.append(wrap)
  }

  const wraps = Array.from(container.querySelectorAll<HTMLDivElement>('.pdf-canvas-wrap'))
  for (let index = wraps.length - 1; index >= 0; index -= 1) {
    const page = Number(wraps[index].dataset.page)
    if (page > requiredPages) {
      wraps[index].remove()
    }
  }

  // Progressive rendering in chunks to keep long-book scrolling responsive.
  const orderedWraps = Array.from(container.querySelectorAll<HTMLDivElement>('.pdf-canvas-wrap'))
  for (let start = 0; start < orderedWraps.length; start += 4) {
    const chunk = orderedWraps.slice(start, start + 4)
    await Promise.all(
      chunk.map(async (wrap) => {
        const page = Number(wrap.dataset.page ?? '0')
        const canvas = wrap.querySelector('canvas')
        if (!canvas || Number.isNaN(page) || page < 1) {
          return
        }
        const alreadyScale = canvas.dataset.scale ? Number(canvas.dataset.scale) : null
        if (alreadyScale && Math.abs(alreadyScale - scale) < 0.0001 && canvas.width > 0 && canvas.height > 0) {
          return
        }
        await renderPdfPage(pdfDoc, page, scale, canvas)
        canvas.dataset.scale = String(scale)
      }),
    )
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    updateContinuousOverlays(container, annotations, selectedAnnotationId)
  }
  updateContinuousOverlays(container, annotations, selectedAnnotationId)
}

function updateContinuousOverlays(
  container: HTMLDivElement | null,
  annotations: PdfAnnotation[],
  selectedAnnotationId?: string | null,
) {
  if (!container) {
    return
  }
  const wraps = container.querySelectorAll<HTMLDivElement>('.pdf-canvas-wrap')
  wraps.forEach((wrap) => {
    const page = Number(wrap.dataset.page ?? '0')
    const layer = wrap.querySelector<HTMLDivElement>('.annotation-overlay')
    if (!layer || page < 1) {
      return
    }
    layer.innerHTML = ''
    annotations
      .filter((item) => item.page === page)
      .forEach((note) => {
        const box = document.createElement('div')
        box.className = 'annotation-mark'
        if (note.id === selectedAnnotationId) {
          box.classList.add('annotation-mark--active')
        }
        box.dataset.annotationId = note.id
        box.style.left = `${note.x * 100}%`
        box.style.top = `${note.y * 100}%`
        box.style.width = `${note.width * 100}%`
        box.style.height = `${note.height * 100}%`
        box.style.background = `${note.color}55`
        box.style.borderColor = note.color
        box.title = note.comment
        layer.append(box)
      })
  })
}

function centeredRect(x: number, y: number, width: number, height: number) {
  const left = Math.max(0, Math.min(1 - width, x - width / 2))
  const top = Math.max(0, Math.min(1 - height, y - height / 2))
  return { x: left, y: top, width, height }
}

export default App

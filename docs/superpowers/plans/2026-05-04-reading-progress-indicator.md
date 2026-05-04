# Reading Progress Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a display-only toolbar reading progress indicator for PDF and Markdown reader modes.

**Architecture:** Keep UI integration inside the existing reader shell while moving progress formatting and scroll math into a small reader helper module. The app derives PDF progress from `pdfPage` and `pdfDoc?.numPages`, and derives Markdown progress from the existing `viewerSurfaceRef` scroll container.

**Tech Stack:** React 19, TypeScript, Vite, Tauri shell, existing ESLint and `npm run build` verification.

---

## File Structure

- Create: `src/features/reader/progress.ts`
  - Owns pure progress math and text formatting.
  - Keeps edge cases out of `App.tsx`.
- Modify: `src/app/App.tsx`
  - Tracks Markdown scroll progress.
  - Clears stale PDF metadata while a new PDF loads.
  - Computes the active toolbar label.
  - Wires scroll handling to the existing `viewer-surface`.
- Modify: `src/app/app-shell.css`
  - Styles a compact non-interactive toolbar label.

No package changes are required because the project has no existing test runner and this feature can be verified with TypeScript, ESLint, build, and manual app checks.

---

### Task 1: Add Pure Progress Helpers

**Files:**
- Create: `src/features/reader/progress.ts`

- [ ] **Step 1: Create the helper module**

Create `src/features/reader/progress.ts` with:

```ts
export type ScrollMetrics = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export function toWholePercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function getPdfProgressPercent(page: number, totalPages: number) {
  if (totalPages <= 0) {
    return null
  }
  return toWholePercent((page / totalPages) * 100)
}

export function getMarkdownProgressPercent(metrics: ScrollMetrics | null) {
  if (!metrics) {
    return 100
  }

  const maxScroll = metrics.scrollHeight - metrics.clientHeight
  if (maxScroll <= 0) {
    return 100
  }

  return toWholePercent((metrics.scrollTop / maxScroll) * 100)
}

export function formatPdfProgress(page: number, totalPages: number) {
  const percent = getPdfProgressPercent(page, totalPages)
  if (percent == null) {
    return null
  }
  return `Page ${page} / ${totalPages} - ${percent}%`
}

export function formatMarkdownProgress(percent: number) {
  return `${toWholePercent(percent)}% read`
}
```

- [ ] **Step 2: Run TypeScript build to catch helper errors**

Run:

```bash
npm run build
```

Expected: build reaches `vite build` or completes successfully. If this fails, fix TypeScript errors in `src/features/reader/progress.ts` before continuing.

- [ ] **Step 3: Commit helper module**

Run:

```bash
git add src/features/reader/progress.ts
git commit -m "feat: add reader progress helpers"
```

---

### Task 2: Wire Progress Into The Reader Toolbar

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Import React and progress helpers**

Update the React import from:

```ts
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
```

to:

```ts
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
```

In `src/app/App.tsx`, add this import below the existing reader PDF import:

```ts
import { formatMarkdownProgress, formatPdfProgress, getMarkdownProgressPercent } from '../features/reader/progress'
```

- [ ] **Step 2: Add Markdown progress state**

Inside `function App()`, after the existing `pdfMode` state line:

```ts
const [markdownProgress, setMarkdownProgress] = useState(100)
```

- [ ] **Step 3: Add a stable reader scroll progress updater**

Add this callback after `activeAnnotationDraft`:

```ts
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
```

- [ ] **Step 4: Clear stale PDF metadata while a PDF loads**

Update the existing PDF loading effect from:

```ts
useEffect(() => {
  if (!activeFile || activeFile.kind !== 'pdf' || !activeFile.pdfBytes) {
    return
  }
  const pdfBytes = activeFile.pdfBytes
  void (async () => {
    // Pass a copy to pdf.js so app state bytes are not detached.
    const task = getDocument({ data: pdfBytes.slice() })
    const loaded = (await task.promise) as unknown as PdfDocumentLike
    setPdfDoc(loaded)
  })()
}, [activeFile])
```

to:

```ts
useEffect(() => {
  if (!activeFile || activeFile.kind !== 'pdf' || !activeFile.pdfBytes) {
    setPdfDoc(null)
    return
  }

  let isCurrent = true
  const pdfBytes = activeFile.pdfBytes
  setPdfDoc(null)

  void (async () => {
    // Pass a copy to pdf.js so app state bytes are not detached.
    const task = getDocument({ data: pdfBytes.slice() })
    const loaded = (await task.promise) as unknown as PdfDocumentLike
    if (isCurrent) {
      setPdfDoc(loaded)
    }
  })()

  return () => {
    isCurrent = false
  }
}, [activeFile])
```

- [ ] **Step 5: Reset and measure Markdown progress when the active file changes**

Add this effect after the existing `saveActiveFileId(activeFileId)` effect:

```ts
useEffect(() => {
  if (activeFile?.kind !== 'markdown') {
    setMarkdownProgress(100)
    return
  }

  const frame = requestAnimationFrame(updateMarkdownProgress)
  return () => cancelAnimationFrame(frame)
}, [activeFile, updateMarkdownProgress])
```

- [ ] **Step 6: Derive the toolbar label**

Add this memo after `activeAnnotationDraft`:

```ts
const readingProgressLabel = useMemo(() => {
  if (activeFile?.kind === 'pdf') {
    return formatPdfProgress(pdfPage, pdfDoc?.numPages ?? 0)
  }

  if (activeFile?.kind === 'markdown') {
    return formatMarkdownProgress(markdownProgress)
  }

  return null
}, [activeFile?.kind, markdownProgress, pdfDoc?.numPages, pdfPage])
```

- [ ] **Step 7: Attach scroll handler to the reader surface**

Change the viewer section from:

```tsx
<section className="viewer-surface" ref={viewerSurfaceRef}>
```

to:

```tsx
<section
  className="viewer-surface"
  ref={viewerSurfaceRef}
  onScroll={() => {
    if (activeFile?.kind === 'markdown') {
      updateMarkdownProgress()
    }
  }}
>
```

- [ ] **Step 8: Render the toolbar label**

Inside `<div className="pdf-tools">`, before the PDF-only controls block, add:

```tsx
{readingProgressLabel ? <span className="reading-progress-label">{readingProgressLabel}</span> : null}
```

The resulting toolbar starts like:

```tsx
<div className="pdf-tools">
  {readingProgressLabel ? <span className="reading-progress-label">{readingProgressLabel}</span> : null}
  {activeFile.kind === 'pdf' ? (
    <>
```

- [ ] **Step 9: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands complete successfully.

- [ ] **Step 10: Commit reader wiring**

Run:

```bash
git add src/app/App.tsx
git commit -m "feat: show reading progress in toolbar"
```

---

### Task 3: Style The Toolbar Label

**Files:**
- Modify: `src/app/app-shell.css`

- [ ] **Step 1: Add compact label styles**

In `src/app/app-shell.css`, after the `.pdf-tools` block, add:

```css
.reading-progress-label {
  border: 1px solid var(--border-base);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1;
  padding: 8px 10px;
  white-space: nowrap;
}
```

- [ ] **Step 2: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands complete successfully.

- [ ] **Step 3: Commit styling**

Run:

```bash
git add src/app/app-shell.css
git commit -m "style: add reading progress toolbar label"
```

---

### Task 4: Manual Verification

**Files:**
- No file changes unless verification finds a defect.

- [ ] **Step 1: Start the Vite dev server**

Run:

```bash
npm run dev
```

Expected: Vite serves the app at `http://127.0.0.1:1420/`.

- [ ] **Step 2: Verify Markdown progress**

Open `http://127.0.0.1:1420/` in a browser.

Import a Markdown file with enough content to scroll. Confirm:

- The toolbar shows a label like `0% read`, `33% read`, or `100% read`.
- The label changes when scrolling the reader.
- A short non-scrollable Markdown file shows `100% read`.

- [ ] **Step 3: Verify PDF progress**

Import a PDF with multiple pages. Confirm:

- The toolbar shows a label like `Page 1 / 4 - 25%`.
- In single-page mode, clicking `Next` changes the page and percentage.
- The label is not shown before the PDF page count is available.

- [ ] **Step 4: Verify layout**

At a normal desktop width, confirm:

- The progress label does not overlap file title, status text, fullscreen button, PDF controls, or mode select.
- The toolbar wraps cleanly if the window is narrowed.

- [ ] **Step 5: Final verification**

Run:

```bash
npm run lint
npm run build
git status --short
```

Expected:

- `npm run lint` passes.
- `npm run build` passes.
- `git status --short` shows no unexpected uncommitted files.

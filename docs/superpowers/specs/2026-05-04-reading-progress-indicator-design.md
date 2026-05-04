# Reading Progress Indicator Design

## Goal

Add a display-only reading progress indicator to Northstar's reader toolbar for both PDF and Markdown files.

## Scope

This first version shows current progress only. It does not save or restore Markdown scroll position.

## Placement

Progress appears as compact text in the existing reader toolbar, beside the current reader controls.

## Behavior

For PDF files, progress is derived from the active page and total page count:

- Format: `Page 8 / 24 - 33%`
- The percentage is rounded to the nearest whole number.
- The percentage is hidden until the PDF page count is available.
- Single-page and continuous PDF modes use the current `pdfPage` state as the active page.

For Markdown files, progress is derived from the reader scroll container:

- Format: `33% read`
- The percentage is rounded to the nearest whole number.
- Empty or non-scrollable Markdown content shows `100% read`.
- Progress updates while the user scrolls the reader.

## Technical Shape

The feature stays inside the reader shell implementation in `src/app/App.tsx`.

- Add local state for Markdown scroll progress.
- Compute PDF progress from `pdfPage` and `pdfDoc?.numPages`.
- Update Markdown progress from `viewerSurfaceRef.current` scroll metrics.
- Render a small toolbar label only when the active file is a PDF or Markdown file.
- Add focused CSS in `src/app/app-shell.css` for a muted, non-interactive toolbar label.

## Error Handling

If scroll metrics are unavailable, Markdown progress falls back to `100% read`.

If PDF metadata is not loaded yet, hide the progress label until `numPages` is known.

## Testing And Verification

Verification should include:

- `npm run lint`
- `npm run build`
- Manual browser or app check with one Markdown file and one PDF file

Manual checks should confirm:

- Markdown progress changes as the reader scrolls.
- Markdown non-scrollable content shows `100% read`.
- PDF progress reflects the current page and total page count.
- Toolbar text does not overlap existing controls at normal desktop widths.

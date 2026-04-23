import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { PdfAnnotation } from './types'

export async function bakePdfAnnotations(pdfBytes: Uint8Array, annotations: PdfAnnotation[]) {
  const doc = await PDFDocument.load(pdfBytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (const note of annotations) {
    const page = doc.getPage(note.page - 1)
    if (!page) {
      continue
    }

    const { width: pageWidth, height: pageHeight } = page.getSize()
    const x = note.x * pageWidth
    const yTop = note.y * pageHeight
    const rectWidth = Math.max(8, note.width * pageWidth)
    const rectHeight = Math.max(8, note.height * pageHeight)
    const y = pageHeight - yTop - rectHeight
    const fillColor = hexToRgb(note.color)
    const borderColor = hexToRgb(note.color, 0.8)

    page.drawRectangle({
      x,
      y,
      width: rectWidth,
      height: rectHeight,
      color: rgb(fillColor.r, fillColor.g, fillColor.b),
      opacity: note.kind === 'comment' ? 0.22 : 0.34,
      borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
      borderWidth: 1,
    })

    if (note.comment.trim()) {
      page.drawText(note.comment.trim(), {
        x,
        y: Math.max(0, y - 14),
        size: 10,
        color: rgb(0.2, 0.22, 0.28),
        font,
      })
    }
  }

  return new Uint8Array(await doc.save())
}

export function downloadBytes(name: string, bytes: Uint8Array, mimeType: string) {
  const stableBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([stableBuffer], { type: mimeType })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

function hexToRgb(value: string, fallback = 1) {
  const clean = value.trim().replace('#', '')
  if (clean.length !== 6) {
    return { r: fallback, g: fallback, b: fallback }
  }
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { r: fallback, g: fallback, b: fallback }
  }
  return { r, g, b }
}

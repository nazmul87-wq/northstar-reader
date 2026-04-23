export type ReaderFileKind = 'markdown' | 'pdf'

export type PdfAnnotation = {
  id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  kind: 'highlight' | 'comment'
  comment: string
  color: string
  createdAt: number
  updatedAt?: number
}

export type ReaderFile = {
  id: string
  name: string
  kind: ReaderFileKind
  markdownText?: string
  pdfBytes?: Uint8Array
  annotations: PdfAnnotation[]
  createdAt: number
  updatedAt: number
}

export type ReadingPrefs = {
  fileId: string
  pdfPage?: number
  pdfScale?: number
  mdScrollTop?: number
}

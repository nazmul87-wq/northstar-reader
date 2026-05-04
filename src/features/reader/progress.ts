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

import { parse, stringify } from 'yaml'

export interface ParsedMetadata {
  title: string
  tags: string[]
  properties: Record<string, unknown>
  headings: string[]
}

export function parseMetadata(path: string, content: string): ParsedMetadata {
  const parsed = splitFrontmatter(content)
  const properties = normalizeProperties(parsed.data)
  const headings = parsed.body
    .split('\n')
    .map((line) => line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean) as string[]

  const title =
    typeof properties.title === 'string' && properties.title.trim()
      ? properties.title.trim()
      : headings[0] ?? titleFromPath(path)

  return {
    title,
    tags: extractTags(parsed.body, properties.tags),
    properties,
    headings,
  }
}

export function extractTags(content: string, candidate: unknown) {
  const frontmatterTags = Array.isArray(candidate)
    ? candidate.filter((value): value is string => typeof value === 'string')
    : typeof candidate === 'string'
      ? candidate
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : []

  const inlineTags = [...content.matchAll(/(^|\s)#([a-zA-Z0-9/_-]+)/g)].map((match) => match[2])
  return [...new Set([...frontmatterTags, ...inlineTags])]
}

export function titleFromPath(path: string) {
  const leaf = path.split(/[\\/]/).pop() ?? path
  return leaf.replace(/\.md$/i, '')
}

export function buildFrontmatter(content: string, properties: Record<string, unknown>) {
  const parsed = splitFrontmatter(content)
  const body = parsed.body.replace(/^\n+/, '')
  const yamlBlock = stringify(properties).trim()

  if (!yamlBlock) {
    return body
  }

  return `---\n${yamlBlock}\n---\n\n${body}`
}

export function stripFrontmatter(content: string) {
  return splitFrontmatter(content).body.replace(/^\n+/, '')
}

export function decorateWikiLinks(content: string) {
  return content.replace(
    /\[\[([^\]#|]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
    (_, title, heading, alias) => {
      const label = alias || title
      const target = heading ? `${title}#${heading}` : title
      return `[${label}](wikilink:${target})`
    },
  )
}

export function findWikiToken(value: string, cursorIndex: number) {
  const prefix = value.slice(0, cursorIndex)
  const openIndex = prefix.lastIndexOf('[[')
  const closeIndex = prefix.lastIndexOf(']]')

  if (openIndex === -1 || closeIndex > openIndex) {
    return null
  }

  const token = prefix.slice(openIndex + 2)
  if (token.includes('\n')) {
    return null
  }

  return {
    from: openIndex + 2,
    query: token.toLowerCase(),
  }
}

function normalizeProperties(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  return Object.entries(input).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = value
    return acc
  }, {})
}

function splitFrontmatter(content: string) {
  if (!content.startsWith('---\n')) {
    return {
      data: {},
      body: content,
    }
  }

  const closingIndex = content.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return {
      data: {},
      body: content,
    }
  }

  const rawFrontmatter = content.slice(4, closingIndex)
  const body = content.slice(closingIndex + 5)
  const parsed = parse(rawFrontmatter)

  return {
    data: parsed && typeof parsed === 'object' ? parsed : {},
    body,
  }
}

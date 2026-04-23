use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use regex::Regex;
use rusqlite::{params, Connection};

use crate::{
    error::AppResult,
    models::{BacklinkReference, SearchResult, VaultContext},
    util::paths,
};

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  relative_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  modified_ms INTEGER NOT NULL,
  indexed_ms INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  relative_path UNINDEXED,
  title,
  content,
  content='documents',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, relative_path, title, content)
  VALUES (new.id, new.relative_path, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, relative_path, title, content)
  VALUES ('delete', old.id, old.relative_path, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, relative_path, title, content)
  VALUES ('delete', old.id, old.relative_path, old.title, old.content);
  INSERT INTO documents_fts(rowid, relative_path, title, content)
  VALUES (new.id, new.relative_path, new.title, new.content);
END;

CREATE TABLE IF NOT EXISTS links (
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  raw_target TEXT NOT NULL,
  kind TEXT NOT NULL,
  line INTEGER,
  context TEXT,
  created_ms INTEGER NOT NULL,
  PRIMARY KEY (source_path, target_path, raw_target, line)
);

CREATE INDEX IF NOT EXISTS idx_links_target_path ON links(target_path);
"#;

pub fn ensure_database(vault: &VaultContext) -> AppResult<()> {
    let connection = open_connection(vault)?;
    drop(connection);
    Ok(())
}

pub fn upsert_document(
    vault: &VaultContext,
    relative_path: &str,
    content: &str,
    modified_ms: i64,
) -> AppResult<()> {
    let connection = open_connection(vault)?;
    let title = extract_title(content, relative_path);
    let indexed_ms = epoch_ms();

    connection.execute(
        r#"
        INSERT INTO documents (relative_path, title, content, modified_ms, indexed_ms)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(relative_path) DO UPDATE SET
          title = excluded.title,
          content = excluded.content,
          modified_ms = excluded.modified_ms,
          indexed_ms = excluded.indexed_ms
        "#,
        params![relative_path, title, content, modified_ms, indexed_ms],
    )?;

    connection.execute("DELETE FROM links WHERE source_path = ?1", params![relative_path])?;
    for link in extract_links(content, relative_path) {
        connection.execute(
            r#"
            INSERT OR REPLACE INTO links
              (source_path, target_path, raw_target, kind, line, context, created_ms)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                relative_path,
                link.target_path,
                link.raw_target,
                link.kind,
                link.line as i64,
                link.context,
                indexed_ms
            ],
        )?;
    }

    Ok(())
}

pub fn delete_document(vault: &VaultContext, relative_path: &str) -> AppResult<()> {
    let connection = open_connection(vault)?;
    connection.execute("DELETE FROM links WHERE source_path = ?1", params![relative_path])?;
    connection.execute("DELETE FROM documents WHERE relative_path = ?1", params![relative_path])?;
    Ok(())
}

pub fn list_indexed_paths(vault: &VaultContext) -> AppResult<Vec<String>> {
    let connection = open_connection(vault)?;
    let mut statement = connection.prepare("SELECT relative_path FROM documents ORDER BY relative_path")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }

    Ok(items)
}

pub fn search(vault: &VaultContext, query: &str, limit: usize) -> AppResult<Vec<SearchResult>> {
    let connection = open_connection(vault)?;
    let mut statement = connection.prepare(
        r#"
        SELECT
          documents.relative_path,
          documents.title,
          snippet(documents_fts, 2, '<mark>', '</mark>', ' … ', 12) AS snippet,
          bm25(documents_fts) AS score
        FROM documents_fts
        JOIN documents ON documents.id = documents_fts.rowid
        WHERE documents_fts MATCH ?1
        ORDER BY score
        LIMIT ?2
        "#,
    )?;

    let rows = statement.query_map(params![query, limit as i64], |row| {
        Ok(SearchResult {
            path: row.get(0)?,
            title: row.get(1)?,
            snippet: row.get(2)?,
            score: row.get(3)?,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }

    Ok(items)
}

pub fn backlinks(
    vault: &VaultContext,
    target_path: &str,
    limit: usize,
) -> AppResult<Vec<BacklinkReference>> {
    let connection = open_connection(vault)?;
    let mut statement = connection.prepare(
        r#"
        SELECT
          links.source_path,
          COALESCE(documents.title, links.source_path) AS source_title,
          COALESCE(links.context, substr(documents.content, 1, 160), '') AS preview,
          links.kind
        FROM links
        LEFT JOIN documents ON documents.relative_path = links.source_path
        WHERE links.target_path = ?1
        ORDER BY links.source_path
        LIMIT ?2
        "#,
    )?;

    let rows = statement.query_map(params![target_path, limit as i64], |row| {
        Ok(BacklinkReference {
            source_path: row.get(0)?,
            source_title: row.get(1)?,
            preview: row.get(2)?,
            kind: row.get(3)?,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }

    Ok(items)
}

fn open_connection(vault: &VaultContext) -> AppResult<Connection> {
    let path = PathBuf::from(&vault.index_db_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let connection = Connection::open(path)?;
    connection.execute_batch(SCHEMA)?;
    Ok(connection)
}

fn extract_title(content: &str, relative_path: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let title = rest.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }

    Path::new(relative_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(relative_path)
        .to_string()
}

fn extract_links(content: &str, current_relative_path: &str) -> Vec<LinkRecord> {
    let mut links = Vec::new();

    for (line_index, line) in content.lines().enumerate() {
        for captures in wiki_link_regex().captures_iter(line) {
            let raw = captures.get(1).map(|value| value.as_str()).unwrap_or_default();
            if let Some(target_path) = normalize_target_path(raw, current_relative_path) {
                links.push(LinkRecord {
                    target_path,
                    raw_target: raw.to_string(),
                    kind: "wiki".into(),
                    line: line_index + 1,
                    context: clip_preview(line),
                });
            }
        }

        for captures in markdown_link_regex().captures_iter(line) {
            let raw = captures.get(1).map(|value| value.as_str()).unwrap_or_default();
            if let Some(target_path) = normalize_target_path(raw, current_relative_path) {
                links.push(LinkRecord {
                    target_path,
                    raw_target: raw.to_string(),
                    kind: "markdown".into(),
                    line: line_index + 1,
                    context: clip_preview(line),
                });
            }
        }
    }

    links
}

fn normalize_target_path(raw_target: &str, current_relative_path: &str) -> Option<String> {
    let trimmed = raw_target.trim().trim_matches('<').trim_matches('>');
    if trimmed.is_empty()
        || trimmed.starts_with('#')
        || trimmed.starts_with("mailto:")
        || trimmed.starts_with("data:")
        || trimmed.contains("://")
    {
        return None;
    }

    let without_fragment = trimmed.split('#').next()?.trim();
    if without_fragment.is_empty() {
        return None;
    }

    let cleaned = without_fragment.replace('\\', "/");
    let relative_candidate = if cleaned.starts_with('/') {
        PathBuf::from(cleaned.trim_start_matches('/'))
    } else {
        let mut candidate = PathBuf::new();
        if let Some(parent) = Path::new(current_relative_path).parent() {
            if !parent.as_os_str().is_empty() {
                candidate.push(parent);
            }
        }
        candidate.push(cleaned);
        candidate
    };

    let mut normalized = normalize_link_components(&relative_candidate)?;
    if !paths::is_markdown_path(&normalized) {
        if normalized.extension().is_some() {
            return None;
        }
        normalized.set_extension("md");
    }

    Some(paths::to_forward_slashes(&normalized))
}

fn normalize_link_components(path: &Path) -> Option<PathBuf> {
    use std::path::Component;

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => normalized.push(part),
            Component::ParentDir => {
                if !normalized.pop() {
                    return None;
                }
            }
            Component::Prefix(_) | Component::RootDir => return None,
        }
    }

    if normalized.as_os_str().is_empty() {
        return None;
    }

    Some(normalized)
}

fn clip_preview(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.len() <= 160 {
        return trimmed.to_string();
    }

    format!("{}...", &trimmed[..157])
}

fn wiki_link_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]").unwrap())
}

fn markdown_link_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\[[^\]]+\]\(([^)]+)\)").unwrap())
}

fn epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

struct LinkRecord {
    target_path: String,
    raw_target: String,
    kind: String,
    line: usize,
    context: String,
}

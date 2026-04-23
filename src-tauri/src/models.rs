use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultContext {
    pub name: String,
    pub root_path: String,
    pub metadata_path: String,
    pub index_db_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentVault {
    pub name: String,
    pub root_path: String,
    pub last_opened_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Directory,
    MarkdownFile,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeEntry {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub depth: usize,
    pub parent_path: Option<String>,
    pub size_bytes: Option<u64>,
    pub modified_ms: Option<i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocument {
    pub path: String,
    pub content: String,
    pub size_bytes: u64,
    pub modified_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkReference {
    pub source_path: String,
    pub source_title: String,
    pub preview: String,
    pub kind: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub indexed_documents: usize,
    pub deleted_documents: usize,
    pub skipped_documents: usize,
    pub updated_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStatus {
    pub active: bool,
    pub root_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchEventPayload {
    pub kind: String,
    pub paths: Vec<String>,
}

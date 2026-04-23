import type { ReaderFile, ReadingPrefs } from './types'

const DB_NAME = 'northstar-reader-db'
const DB_VERSION = 1
const FILE_STORE = 'library_files'
const PREF_STORE = 'reading_prefs'
const ACTIVE_KEY = 'active-file-id'

type StoredReaderFile = Omit<ReaderFile, 'pdfBytes'> & {
  pdfBytes?: ArrayBuffer
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(PREF_STORE)) {
        db.createObjectStore(PREF_STORE, { keyPath: 'fileId' })
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function toStored(file: ReaderFile): StoredReaderFile {
  const pdfBytes = file.pdfBytes ? file.pdfBytes.slice().buffer : undefined
  return {
    ...file,
    pdfBytes,
  }
}

function fromStored(file: StoredReaderFile): ReaderFile {
  return {
    ...file,
    annotations: file.annotations.map((item) => ({
      ...item,
      kind: item.kind ?? (item.comment?.trim() ? 'comment' : 'highlight'),
      color: item.color ?? '#ffd966',
    })),
    pdfBytes: file.pdfBytes ? new Uint8Array(file.pdfBytes) : undefined,
  }
}

async function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, done: (value: T) => void) => void,
) {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    action(store, resolve)
    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => db.close()
  })
}

export async function loadLibrary() {
  return transaction<ReaderFile[]>(FILE_STORE, 'readonly', (store, done) => {
    const request = store.getAll()
    request.onsuccess = () => {
      const files = (request.result as StoredReaderFile[])
        .map(fromStored)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      done(files)
    }
  })
}

export async function saveLibraryFile(file: ReaderFile) {
  return transaction<void>(FILE_STORE, 'readwrite', (store, done) => {
    store.put(toStored(file))
    done(undefined)
  })
}

export async function deleteLibraryFile(id: string) {
  return transaction<void>(FILE_STORE, 'readwrite', (store, done) => {
    store.delete(id)
    done(undefined)
  })
}

export async function loadReadingPref(fileId: string) {
  return transaction<ReadingPrefs | null>(PREF_STORE, 'readonly', (store, done) => {
    const request = store.get(fileId)
    request.onsuccess = () => done((request.result as ReadingPrefs | undefined) ?? null)
  })
}

export async function saveReadingPref(pref: ReadingPrefs) {
  return transaction<void>(PREF_STORE, 'readwrite', (store, done) => {
    store.put(pref)
    done(undefined)
  })
}

export function saveActiveFileId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_KEY, id)
  } else {
    localStorage.removeItem(ACTIVE_KEY)
  }
}

export function loadActiveFileId() {
  return localStorage.getItem(ACTIVE_KEY)
}

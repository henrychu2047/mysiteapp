import type { DrawingDocument } from './drawing-types'

const DRAWING_DB = 'site-drawing-db'
const META_STORE = 'drawing-metadata'
const PDF_STORE = 'drawing-pdfs'
const DRAWING_DB_VERSION = 1

type StoredDrawing = Omit<DrawingDocument, 'pdf'>

function openDrawingDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DRAWING_DB, DRAWING_DB_VERSION)
    let blocked = false
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        const store = db.createObjectStore(META_STORE, { keyPath: 'id' })
        store.createIndex('projectId', 'projectId', { unique: false })
      }
      if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE)
    }
    request.onsuccess = () => {
      if (blocked) {
        request.result.close()
        return
      }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new DOMException('圖紙資料庫正被另一個分頁使用，請關閉其他分頁後重試', 'InvalidStateError'))
    }
  })
}

function storageFailure(transaction: IDBTransaction, requestError?: DOMException | null) {
  return requestError || transaction.error || new DOMException('圖紙資料庫交易已中止', 'AbortError')
}

function withoutPdf(drawing: DrawingDocument): StoredDrawing {
  const { pdf: _pdf, ...metadata } = drawing
  return structuredClone(metadata)
}

function transact<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => { result: () => T; error?: () => DOMException | null },
) {
  return openDrawingDb().then(db => new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction
    let operation: ReturnType<typeof run>
    try {
      transaction = db.transaction(stores, mode)
      operation = run(transaction)
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    transaction.oncomplete = () => {
      db.close()
      resolve(operation.result())
    }
    transaction.onerror = () => {
      db.close()
      reject(storageFailure(transaction, operation.error?.()))
    }
    transaction.onabort = () => {
      db.close()
      reject(storageFailure(transaction, operation.error?.()))
    }
  }))
}

export function describeDrawingStorageError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') return '裝置儲存空間不足，請先匯出圖紙 ZIP 備份或移除不需要的圖紙'
    if (error.name === 'SecurityError') return '瀏覽器禁止本機保存；請退出私密瀏覽模式後重試'
    if (error.name === 'InvalidStateError' || error.name === 'VersionError') return '圖紙資料庫暫時無法使用，請關閉其他 App 分頁後重試'
  }
  return error instanceof Error && error.message ? `圖紙保存失敗：${error.message}` : '圖紙保存失敗，請稍後重試'
}

export function loadProjectDrawings(projectId: string): Promise<DrawingDocument[]> {
  return transact([META_STORE, PDF_STORE], 'readonly', transaction => {
    const metaStore = transaction.objectStore(META_STORE)
    const request = metaStore.index('projectId').getAll(projectId)
    const pdfStore = transaction.objectStore(PDF_STORE)
    const pdfRequests = new Map<string, IDBRequest<Blob | undefined>>()
    let metadata: StoredDrawing[] = []
    request.onsuccess = () => {
      metadata = request.result as StoredDrawing[]
      metadata.forEach(item => pdfRequests.set(item.id, pdfStore.get(item.id)))
    }
    return {
      result: () => metadata
        .map(item => {
          const pdf = pdfRequests.get(item.id)?.result
          return pdf instanceof Blob ? { ...item, pdf } : null
        })
        .filter((item): item is DrawingDocument => Boolean(item))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      error: () => request.error,
    }
  })
}

export function loadDrawing(id: string): Promise<DrawingDocument | null> {
  return transact([META_STORE, PDF_STORE], 'readonly', transaction => {
    const metaRequest = transaction.objectStore(META_STORE).get(id) as IDBRequest<StoredDrawing | undefined>
    const pdfRequest = transaction.objectStore(PDF_STORE).get(id) as IDBRequest<Blob | undefined>
    return {
      result: () => metaRequest.result && pdfRequest.result instanceof Blob
        ? { ...metaRequest.result, pdf: pdfRequest.result }
        : null,
      error: () => metaRequest.error || pdfRequest.error,
    }
  })
}

/** Saves immutable source bytes and editable metadata in one atomic transaction. */
export function saveDrawing(drawing: DrawingDocument): Promise<void> {
  return transact([META_STORE, PDF_STORE], 'readwrite', transaction => {
    const metaRequest = transaction.objectStore(META_STORE).put(withoutPdf(drawing))
    const pdfRequest = transaction.objectStore(PDF_STORE).put(drawing.pdf, drawing.id)
    return { result: () => undefined, error: () => metaRequest.error || pdfRequest.error }
  })
}

export function deleteDrawing(id: string): Promise<void> {
  return transact([META_STORE, PDF_STORE], 'readwrite', transaction => {
    const metaRequest = transaction.objectStore(META_STORE).delete(id)
    const pdfRequest = transaction.objectStore(PDF_STORE).delete(id)
    return { result: () => undefined, error: () => metaRequest.error || pdfRequest.error }
  })
}

export async function saveDrawings(drawings: DrawingDocument[]) {
  if (!drawings.length) return
  await transact([META_STORE, PDF_STORE], 'readwrite', transaction => {
    const metaStore = transaction.objectStore(META_STORE)
    const pdfStore = transaction.objectStore(PDF_STORE)
    let operationError: DOMException | null = null
    drawings.forEach(drawing => {
      const metaRequest = metaStore.put(withoutPdf(drawing))
      const pdfRequest = pdfStore.put(drawing.pdf, drawing.id)
      metaRequest.onerror = () => { operationError = metaRequest.error }
      pdfRequest.onerror = () => { operationError = pdfRequest.error }
    })
    return { result: () => undefined, error: () => operationError }
  })
}

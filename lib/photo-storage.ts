import { DEFAULT_PROJECT } from '@/lib/project-settings'

export type PhotoAnnotation = {
  kind: 'text' | 'marker' | 'draw'
  x: number
  y: number
  text?: string
  points?: Array<{ x: number; y: number }>
}

export type Photo = {
  id: string
  src: string
  cleanSrc: string
  originalBlob?: Blob
  thumbnailBlob?: Blob
  stampedBlob?: Blob
  category: string
  tags: Record<string, string>
  note: string
  createdAt: string
  projectId: string
  annotations?: PhotoAnnotation[]
}

const PHOTO_DB = 'site-photo-db'
const PHOTO_STORE = 'photos'

function openPhotoDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function loadStoredPhotos() {
  return openPhotoDb().then(db => new Promise<Photo[]>((resolve, reject) => {
    const request = db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE).getAll()
    request.onsuccess = () => resolve(request.result as Photo[])
    request.onerror = () => reject(request.error)
  }))
}

export function hydratePhoto(photo: Photo): Photo {
  const rawTags = photo.tags && typeof photo.tags === 'object' ? photo.tags : {}
  const tags = Object.fromEntries(Object.entries(rawTags).filter(([key]) => typeof key === 'string').map(([key, value]) => [key, typeof value === 'string' ? value : value == null ? '' : String(value)]))
  const annotations = Array.isArray(photo.annotations)
    ? photo.annotations.filter(annotation => annotation && (annotation.kind === 'text' || annotation.kind === 'marker' || annotation.kind === 'draw')).map(annotation => ({
      kind: annotation.kind,
      x: Number.isFinite(annotation.x) ? Math.max(0, Math.min(1, annotation.x)) : 0.5,
      y: Number.isFinite(annotation.y) ? Math.max(0, Math.min(1, annotation.y)) : 0.5,
      text: typeof annotation.text === 'string' ? annotation.text : undefined,
      points: Array.isArray(annotation.points) ? annotation.points.filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)).map(point => ({ x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) })) : undefined,
    })).filter(annotation => annotation.kind !== 'text' || Boolean(annotation.text)) : []
  photo = { ...photo, category: typeof photo.category === 'string' ? photo.category : '其它', tags, note: typeof photo.note === 'string' ? photo.note : '', annotations }
  if (!photo.originalBlob && !photo.thumbnailBlob) return photo
  const stampedUrl = photo.stampedBlob ? URL.createObjectURL(photo.stampedBlob) : photo.src
  const originalUrl = photo.originalBlob ? URL.createObjectURL(photo.originalBlob) : photo.cleanSrc
  const thumbnailUrl = photo.thumbnailBlob ? URL.createObjectURL(photo.thumbnailBlob) : stampedUrl
  return { ...photo, src: thumbnailUrl, cleanSrc: originalUrl }
}

export function releasePhotoUrls(photos: Photo[]) {
  photos.forEach(photo => {
    if (photo.src.startsWith('blob:')) URL.revokeObjectURL(photo.src)
    if (photo.cleanSrc.startsWith('blob:') && photo.cleanSrc !== photo.src) URL.revokeObjectURL(photo.cleanSrc)
  })
}

export function saveStoredPhotos(photos: Photo[], projectId: string) {
  return openPhotoDb().then(db => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, 'readwrite')
    const store = transaction.objectStore(PHOTO_STORE)
    const currentIds = new Set(photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === projectId).map(photo => photo.id))
    const existingRequest = store.getAll()
    existingRequest.onsuccess = () => {
      ;(existingRequest.result as Photo[]).forEach(photo => {
        if ((photo.projectId || DEFAULT_PROJECT.id) === projectId && !currentIds.has(photo.id)) store.delete(photo.id)
      })
      photos.filter(photo => (photo.projectId || DEFAULT_PROJECT.id) === projectId).forEach(photo => store.put(photo.originalBlob || photo.stampedBlob ? { ...photo, src: '', cleanSrc: '' } : photo))
    }
    existingRequest.onerror = () => { reject(existingRequest.error); try { transaction.abort() } catch {} }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  }))
}

export function createId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

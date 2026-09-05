export type NotebookEntry = {
  id: string
  text: string
  category: string
  done: boolean
  pinned: boolean
  createdAt: string
  photo?: string
  photoId?: string
}

const DEFAULT_PROJECT_ID = 'default-project'
const keyFor = (projectId: string) => `site-notebook:${projectId || DEFAULT_PROJECT_ID}`

function normalizeEntries(value: unknown): NotebookEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Partial<NotebookEntry>
    if (typeof entry.id !== 'string' || typeof entry.text !== 'string') return []
    return [{
      id: entry.id,
      text: entry.text,
      category: typeof entry.category === 'string' ? entry.category : '待辦',
      done: Boolean(entry.done),
      pinned: Boolean(entry.pinned),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
      photo: typeof entry.photo === 'string' ? entry.photo : undefined,
      photoId: typeof entry.photoId === 'string' ? entry.photoId : undefined,
    }]
  })
}

export function loadNotebook(projectId: string): NotebookEntry[] {
  const saved = localStorage.getItem(keyFor(projectId))
  return normalizeEntries(saved ? JSON.parse(saved) : [])
}

export function saveNotebook(projectId: string, entries: NotebookEntry[]) {
  localStorage.setItem(keyFor(projectId), JSON.stringify(entries))
}

export function loadAllNotebooks(projectIds: string[]) {
  return Object.fromEntries(projectIds.map(projectId => [projectId, loadNotebook(projectId)]))
}

export function saveAllNotebooks(notebooks: Record<string, unknown>) {
  for (const [projectId, entries] of Object.entries(notebooks)) {
    saveNotebook(projectId, normalizeEntries(entries))
  }
}

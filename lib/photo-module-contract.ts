/** Public Camera / Album contract used by feature modules. */

export type PhotoUsage = 'site-memo' | 'handover' | 'notebook' | 'database' | 'general'
export type PhotoSelection = 'single' | 'multiple'

export type PhotoPickerRequest = {
  projectId: string
  source: 'camera' | 'album'
  selection: PhotoSelection
  usage?: PhotoUsage
  defaultCategory?: string
  defaultSmartTagIds?: string[]
}

export type PhotoReference = {
  id: string
  projectId: string
  thumbnailUrl?: string
  category?: string
  createdAt?: string
}

export type PhotoPickerResult = {
  photoIds: string[]
  photos: PhotoReference[]
}

export interface CameraAlbumService {
  open(request: PhotoPickerRequest): Promise<PhotoPickerResult>
  getById(photoId: string): Promise<PhotoReference | null>
  getByIds(photoIds: string[]): Promise<PhotoReference[]>
}


/** Shared drawing contract. Coordinates use a rotation=0 PDF.js viewport,
 * normalized to 0..1 from its top-left; native page rotation is applied at view time.
 * Page numbers are one-based. Original PDF bytes must remain unchanged.
 */
export type DrawingPoint = { x: number; y: number }
export type DrawingRoomLabel = DrawingPoint & {
  id: string; page: number; text: string; width: number; height: number
  source: 'pdf-text' | 'ocr'; confidence?: number
}
export type DrawingMarker = DrawingPoint & {
  id: string; number: number; page: number; roomName: string
  category: string; tags: Record<string, string>; note: string; photoIds: string[]
  createdAt: string; updatedAt: string; cropScale?: number
}
export type DrawingAnnotation = DrawingPoint & {
  id: string; page: number; kind: 'cloud' | 'line' | 'arrow' | 'text' | 'rectangle' | 'ellipse' | 'callout'
  endX: number; endY: number; text?: string; color: string; lineWidth: number; fontSize: number
}
export type DrawingDocument = {
  version: 1; id: string; projectId: string; name: string; fileName: string
  pdf: Blob; pageCount: number; createdAt: string; updatedAt: string; nextMarkerNumber: number
  markers: DrawingMarker[]; annotations: DrawingAnnotation[]; roomLabels: DrawingRoomLabel[]
}

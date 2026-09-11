import type { DrawingAnnotation, DrawingDocument, DrawingMarker } from '@/lib/drawing-types'
import type { Photo } from '@/lib/photo-storage'

type DrawingPdfPage = {
  rotate?: number
  getViewport: (options: { scale: number; rotation?: number }) => { width: number; height: number }
  cleanup?: () => void
}

type DrawingPdf = {
  numPages: number
  getPage: (pageNumber: number) => Promise<DrawingPdfPage>
  cleanup?: () => void
  destroy?: () => Promise<void> | void
}

type DrawingPdfTools = {
  loadDrawingPdf: (blob: Blob) => Promise<DrawingPdf>
  renderDrawingPage: (pdf: DrawingPdf, page: DrawingPdfPage, options?: { maxDimension?: number; rotation?: number; signal?: AbortSignal }) => Promise<HTMLCanvasElement>
}

type ReportMarker = DrawingMarker & { cropScale: number }
type ReportPhoto = { photo: Photo | null; source?: string; missingReason?: string }
type ReportItem = { marker: ReportMarker; crop: HTMLCanvasElement; photos: ReportPhoto[] }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF_MIME = 'application/pdf'
const MAX_PAGE_RENDER = 2600
const MAX_CROP_RENDER = 1100

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback
const normalized = (value: number, fallback = 0.5) => clamp(finite(value, fallback), 0, 1)
const safeRotation = (rotation: number | undefined) => ((Math.round(finite(rotation || 0, 0)) % 360) + 360) % 360
const cropScale = (value: number | undefined) => clamp(finite(value || 1, 1), 0.5, 3)
const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

function requireBrowser() {
  if (!isBrowser()) throw new Error('圖紙報告只可在瀏覽器中匯出')
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function text(value: unknown, fallback = '—') {
  const result = typeof value === 'string' ? value.trim() : ''
  return result || fallback
}

function markerSummary(marker: DrawingMarker) {
  const tagText = Object.entries(marker.tags || {}).filter(([, value]) => value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('；')
  return [
    `標記 ${marker.number}`,
    `圖紙：${text(marker.page ? `第 ${marker.page} 頁` : '', '未知')}`,
    `房間：${text(marker.roomName, '未確認')}`,
    `類別：${text(marker.category)}`,
    tagText ? `標籤：${tagText}` : '',
    marker.note ? `備註：${marker.note}` : '',
  ].filter(Boolean).join('　')
}

function normalizedPoint(point: { x: number; y: number }) {
  return { x: normalized(point.x), y: normalized(point.y) }
}

function canvasPoint(canvas: HTMLCanvasElement, point: { x: number; y: number }) {
  const normalizedPointValue = normalizedPoint(point)
  return { x: normalizedPointValue.x * canvas.width, y: normalizedPointValue.y * canvas.height }
}

function safeCanvasColor(value: string) {
  return typeof value === 'string' && value.trim() ? value : '#d91e36'
}

function drawArrowHead(context: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(-size, size * 0.52)
  context.lineTo(-size, -size * 0.52)
  context.closePath()
  context.fill()
  context.restore()
}

function drawCloud(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, lineWidth: number) {
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const width = Math.max(8, Math.abs(x2 - x1))
  const height = Math.max(8, Math.abs(y2 - y1))
  const radius = Math.max(5, Math.min(width, height) * 0.16)
  const scallops = Math.max(2, Math.ceil(Math.max(width, height) / Math.max(12, radius * 1.8)))
  context.save()
  context.lineWidth = lineWidth
  context.beginPath()
  const arcSide = (startX: number, startY: number, endX: number, endY: number, count: number) => {
    const dx = (endX - startX) / count
    const dy = (endY - startY) / count
    for (let index = 0; index < count; index += 1) {
      const cx = startX + dx * (index + 0.5)
      const cy = startY + dy * (index + 0.5)
      const sideLength = Math.hypot(dx, dy)
      const normalX = sideLength ? -dy / sideLength : 0
      const normalY = sideLength ? dx / sideLength : 0
      context.arc(cx + normalX * radius * 0.45, cy + normalY * radius * 0.45, radius, Math.atan2(dy, dx) - Math.PI * 0.62, Math.atan2(dy, dx) + Math.PI * 0.62)
    }
  }
  context.moveTo(left, top)
  arcSide(left, top, left + width, top, Math.max(2, Math.round(scallops * width / Math.max(width, height))))
  arcSide(left + width, top, left + width, top + height, Math.max(2, Math.round(scallops * height / Math.max(width, height))))
  arcSide(left + width, top + height, left, top + height, Math.max(2, Math.round(scallops * width / Math.max(width, height))))
  arcSide(left, top + height, left, top, Math.max(2, Math.round(scallops * height / Math.max(width, height))))
  context.stroke()
  context.restore()
}

function drawAnnotation(context: CanvasRenderingContext2D, annotation: DrawingAnnotation, canvas: HTMLCanvasElement) {
  const start = canvasPoint(canvas, annotation)
  const end = canvasPoint(canvas, { x: annotation.endX, y: annotation.endY })
  const lineWidth = clamp(finite(annotation.lineWidth, 3) * Math.max(1, Math.min(canvas.width, canvas.height) / 900), 1, 28)
  const color = safeCanvasColor(annotation.color)
  context.save()
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = lineWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'
  switch (annotation.kind) {
    case 'line':
    case 'arrow': {
      context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke()
      if (annotation.kind === 'arrow') drawArrowHead(context, end.x, end.y, Math.atan2(end.y - start.y, end.x - start.x), Math.max(10, lineWidth * 4))
      break
    }
    case 'rectangle':
      context.strokeRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y))
      break
    case 'ellipse':
      context.beginPath(); context.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.max(2, Math.abs(end.x - start.x) / 2), Math.max(2, Math.abs(end.y - start.y) / 2), 0, 0, Math.PI * 2); context.stroke()
      break
    case 'cloud':
      drawCloud(context, start.x, start.y, end.x, end.y, lineWidth)
      break
    case 'text': {
      const fontSize = clamp(finite(annotation.fontSize, 22) * Math.max(1, Math.min(canvas.width, canvas.height) / 900), 12, 96)
      context.font = `600 ${fontSize}px Arial, "Microsoft JhengHei", sans-serif`
      context.textBaseline = 'top'
      String(annotation.text || '').split(/\r?\n/).forEach((line, index) => context.fillText(line, start.x, start.y + index * fontSize * 1.25))
      break
    }
  }
  context.restore()
}

function drawMarkerLabel(context: CanvasRenderingContext2D, marker: DrawingMarker, canvas: HTMLCanvasElement) {
  const point = canvasPoint(canvas, marker)
  const radius = clamp(Math.min(canvas.width, canvas.height) * 0.018, 16, 34)
  const label = String(marker.number)
  context.save()
  context.lineWidth = Math.max(2, radius * 0.12)
  context.fillStyle = '#d91e36'
  context.strokeStyle = '#ffffff'
  context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill(); context.stroke()
  context.fillStyle = '#ffffff'
  context.font = `700 ${clamp(radius * 0.95, 14, 28)}px Arial, sans-serif`
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, point.x, point.y)
  context.restore()
}

function drawCanonicalMarkup(base: HTMLCanvasElement, drawing: DrawingDocument, pageNumber: number) {
  const canvas = document.createElement('canvas')
  canvas.width = base.width; canvas.height = base.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('無法建立圖紙標記畫布')
  context.drawImage(base, 0, 0)
  drawing.annotations.filter(annotation => annotation.page === pageNumber).forEach(annotation => drawAnnotation(context, annotation, canvas))
  drawing.markers.filter(marker => marker.page === pageNumber).forEach(marker => drawMarkerLabel(context, marker, canvas))
  return canvas
}

function toNaturalOrientation(canonical: HTMLCanvasElement, rotation: number) {
  const normalizedRotation = safeRotation(rotation)
  const swap = normalizedRotation === 90 || normalizedRotation === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? canonical.height : canonical.width
  canvas.height = swap ? canonical.width : canonical.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('無法建立匯出畫布')
  context.save()
  if (normalizedRotation === 90) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2) }
  else if (normalizedRotation === 180) { context.translate(canvas.width, canvas.height); context.rotate(Math.PI) }
  else if (normalizedRotation === 270) { context.translate(0, canvas.height); context.rotate(-Math.PI / 2) }
  context.drawImage(canonical, 0, 0)
  context.restore()
  return canvas
}

async function drawingPdfTools() {
  // Terra's drawing-pdf module owns PDF.js worker configuration and page rendering.
  return import('@/lib/drawing-pdf') as Promise<DrawingPdfTools>
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = fileName; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}

async function shareOrDownload(blob: Blob, fileName: string, title: string) {
  const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: blob.type }) : null
  if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try { await navigator.share({ files: [file], title }); return } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return }
  }
  downloadBlob(blob, fileName)
}

async function renderCanonicalPage(pdf: DrawingPdf, pageNumber: number, tools: DrawingPdfTools) {
  const page = await pdf.getPage(pageNumber)
  const canvas = await tools.renderDrawingPage(pdf, page, { maxDimension: MAX_PAGE_RENDER, rotation: 0 })
  const viewport = page.getViewport({ scale: 1, rotation: 0 })
  return { page, canvas, width: viewport.width, height: viewport.height }
}

function cropMarkerPage(source: HTMLCanvasElement, marker: DrawingMarker, scaleValue: number) {
  const scale = cropScale(scaleValue)
  const sourceAspect = source.width / Math.max(1, source.height)
  const targetAspect = 1.42
  const cropWidth = clamp(0.38 / scale, 0.13, 0.82)
  const cropHeight = clamp(cropWidth * sourceAspect / targetAspect, 0.13, 0.92)
  const width = Math.min(cropWidth, 1)
  const height = Math.min(cropHeight, 1)
  const left = clamp(normalized(marker.x) - width / 2, 0, 1 - width)
  const top = clamp(normalized(marker.y) - height / 2, 0, 1 - height)
  const sourceWidth = Math.max(1, Math.round(source.width * width))
  const sourceHeight = Math.max(1, Math.round(source.height * height))
  const outputScale = Math.min(1, MAX_CROP_RENDER / Math.max(sourceWidth, sourceHeight))
  const crop = document.createElement('canvas')
  crop.width = Math.max(1, Math.round(sourceWidth * outputScale))
  crop.height = Math.max(1, Math.round(sourceHeight * outputScale))
  const context = crop.getContext('2d')
  if (!context) throw new Error('無法建立圖紙裁切畫布')
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, crop.width, crop.height)
  context.drawImage(source, Math.round(left * source.width), Math.round(top * source.height), sourceWidth, sourceHeight, 0, 0, crop.width, crop.height)
  const markerX = clamp((normalized(marker.x) - left) / width * crop.width, 0, crop.width)
  const markerY = clamp((normalized(marker.y) - top) / height * crop.height, 0, crop.height)
  const radius = clamp(Math.min(crop.width, crop.height) * 0.085, 18, 36)
  const labelX = clamp(markerX, radius + 2, crop.width - radius - 2)
  const labelY = clamp(markerY, radius + 2, crop.height - radius - 2)
  context.save()
  context.lineWidth = Math.max(2, radius * 0.12); context.fillStyle = '#d91e36'; context.strokeStyle = '#fff'
  context.beginPath(); context.arc(labelX, labelY, radius, 0, Math.PI * 2); context.fill(); context.stroke()
  context.fillStyle = '#fff'; context.font = `700 ${clamp(radius * 0.9, 14, 30)}px Arial, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(marker.number), labelX, labelY)
  context.restore()
  return crop
}

async function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('相片檔案無法讀取'))
    reader.readAsDataURL(blob)
  })
}

async function photoSource(photo: Photo) {
  if (photo.src) return photo.src
  if (photo.cleanSrc) return photo.cleanSrc
  if (photo.originalBlob) return blobDataUrl(photo.originalBlob)
  if (photo.thumbnailBlob) return blobDataUrl(photo.thumbnailBlob)
  return undefined
}

function photoMap(photos: Photo[]) {
  return new Map(photos.map(photo => [photo.id, photo]))
}

async function buildReportItems(drawing: DrawingDocument, markers: ReportMarker[], photos: Photo[], status?: (value: string) => void) {
  const tools = await drawingPdfTools()
  const pdf = await tools.loadDrawingPdf(drawing.pdf)
  const pages = new Map<number, { canvas: HTMLCanvasElement; page: DrawingPdfPage; width: number; height: number }>()
  const byId = photoMap(photos)
  const sourceById = new Map<string, string | undefined>()
  const items: ReportItem[] = []
  try {
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index]
      status?.(`正在建立報表裁切 ${index + 1}/${markers.length}`)
      let rendered = pages.get(marker.page)
      if (!rendered) {
        rendered = await renderCanonicalPage(pdf, marker.page, tools)
        pages.set(marker.page, rendered)
      }
      const crop = cropMarkerPage(rendered.canvas, marker, marker.cropScale)
      const linkedPhotos: ReportPhoto[] = []
      for (const id of marker.photoIds || []) {
        const photo = byId.get(id) || null
        if (!photo) linkedPhotos.push({ photo: null, missingReason: `相片 ${id} 已從相簿移除` })
        else {
          let source = sourceById.get(photo.id)
          if (!sourceById.has(photo.id)) { source = await photoSource(photo); sourceById.set(photo.id, source) }
          linkedPhotos.push({ photo, source, missingReason: !source ? '相片檔案無法使用' : undefined })
        }
      }
      items.push({ marker, crop, photos: linkedPhotos })
    }
    return items
  } finally {
    pages.forEach(value => value.page.cleanup?.())
    await pdf.destroy?.()
  }
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve()
  return new Promise<void>(resolve => { image.onload = () => resolve(); image.onerror = () => resolve() })
}

function reportItemElement(item: ReportItem, projectName: string, drawingName: string) {
  const section = document.createElement('section')
  section.style.cssText = 'box-sizing:border-box;width:1000px;padding:28px 34px;background:#fff;color:#17212b;font-family:Arial,"Microsoft JhengHei",sans-serif;line-height:1.45;'
  const heading = document.createElement('h2'); heading.style.cssText = 'margin:0 0 14px;font-size:25px;color:#162b3a;'; heading.textContent = `標記 ${item.marker.number}　${text(item.marker.category)}`; section.appendChild(heading)
  const details = document.createElement('div'); details.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;border:1px solid #d5dde3;padding:12px 14px;margin-bottom:16px;font-size:16px;'; section.appendChild(details)
  const fields: Array<[string, string]> = [
    ['工程圖', drawingName],
    ['項目', projectName],
    ['頁碼', `第 ${item.marker.page} 頁`],
    ['房間', text(item.marker.roomName, '未確認')],
    ['類別', text(item.marker.category)],
    ['標記編號', String(item.marker.number)],
  ]
  const tagText = Object.entries(item.marker.tags || {}).filter(([, value]) => value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('；')
  if (tagText) fields.push(['標籤', tagText])
  fields.push(['備註', text(item.marker.note)])
  fields.forEach(([label, value]) => { const cell = document.createElement('div'); const strong = document.createElement('b'); strong.textContent = `${label}：`; cell.append(strong, document.createTextNode(value)); details.appendChild(cell) })
  const crop = document.createElement('img'); crop.src = item.crop.toDataURL('image/jpeg', 0.93); crop.alt = `圖紙第 ${item.marker.page} 頁標記 ${item.marker.number} 裁切`; crop.style.cssText = 'display:block;width:100%;max-height:420px;object-fit:contain;border:1px solid #9caab4;background:#f4f7f9;margin:8px 0 18px;'; section.appendChild(crop)
  const photoHeading = document.createElement('h3'); photoHeading.style.cssText = 'margin:8px 0;font-size:19px;'; photoHeading.textContent = `關聯相片（${item.photos.length}）`; section.appendChild(photoHeading)
  const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;'; section.appendChild(grid)
  if (!item.photos.length) { const empty = document.createElement('p'); empty.textContent = '沒有關聯相片（此項目仍保留於報表）。'; grid.appendChild(empty) }
  item.photos.forEach((entry, index) => {
    const card = document.createElement('article'); card.style.cssText = 'border:1px solid #d5dde3;padding:9px;min-height:180px;break-inside:avoid;'; grid.appendChild(card)
    const title = document.createElement('b'); title.textContent = `相片 ${index + 1}`; card.appendChild(title)
    if (entry.source) { const image = document.createElement('img'); image.src = entry.source; image.alt = `${entry.photo?.category || '相片'} ${index + 1}`; image.style.cssText = 'display:block;width:100%;height:150px;object-fit:cover;margin:6px 0;'; card.appendChild(image) }
    else { const warning = document.createElement('p'); warning.style.cssText = 'height:150px;margin:6px 0;display:flex;align-items:center;justify-content:center;background:#fff4e5;color:#9a4e00;text-align:center;'; warning.textContent = `⚠ ${entry.missingReason || '相片無法載入'}`; card.appendChild(warning) }
    if (entry.photo) { const caption = document.createElement('div'); caption.style.cssText = 'font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;'; caption.textContent = [entry.photo.category, Object.entries(entry.photo.tags || {}).filter(([, value]) => value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('；'), entry.photo.note].filter(Boolean).join('\n'); card.appendChild(caption) }
  })
  return section
}

async function exportReportPdf(items: ReportItem[], projectName: string, drawingName: string) {
  const [{ default: html2canvas }, { jsPDF: JsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const reportRoot = document.createElement('div')
  reportRoot.style.cssText = 'position:absolute;left:-100000px;top:0;width:1000px;visibility:visible;background:#fff;z-index:999999;pointer-events:none;'
  document.body.appendChild(reportRoot)
  try {
    const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
    const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); const margin = 8
    let firstPage = true
    for (const item of items) {
      const section = reportItemElement(item, projectName, drawingName)
      reportRoot.replaceChildren(section)
      await Promise.all(Array.from(section.querySelectorAll('img')).map(waitForImage))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const canvas = await html2canvas(section, { scale: 1.25, backgroundColor: '#fff', useCORS: true, allowTaint: true, width: 1000, windowWidth: 1000 })
      const pixelsPerMm = canvas.width / (pageWidth - margin * 2)
      const pagePixels = Math.max(1, Math.floor((pageHeight - margin * 2) * pixelsPerMm))
      let sourceY = 0
      while (sourceY < canvas.height) {
        if (!firstPage) pdf.addPage('a4', 'portrait')
        firstPage = false
        const sliceHeight = Math.min(pagePixels, canvas.height - sourceY)
        const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = sliceHeight
        const context = slice.getContext('2d'); if (!context) throw new Error('無法建立報表頁面')
        context.fillStyle = '#fff'; context.fillRect(0, 0, slice.width, slice.height); context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, slice.width, slice.height)
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, pageWidth - margin * 2, sliceHeight / pixelsPerMm)
        sourceY += sliceHeight
      }
    }
    return pdf.output('blob') as Blob
  } finally { reportRoot.remove() }
}

type WordImage = { id: string; fileName: string; contentType: string; data: Uint8Array }

async function loadWordImage(source: string, index: number): Promise<WordImage> {
  const response = await fetch(source)
  if (!response.ok) throw new Error(`圖片載入失敗 (${response.status})`)
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  return { id: `rIdImage${index}`, fileName: `image${index}.${extension}`, contentType, data: new Uint8Array(await response.arrayBuffer()) }
}

function wordParagraph(value: string, options: { bold?: boolean; size?: number; pageBreakBefore?: boolean } = {}) {
  const pageBreak = options.pageBreakBefore ? '<w:pageBreakBefore/>' : ''
  return `<w:p><w:pPr>${pageBreak}<w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft JhengHei"/>${options.bold ? '<w:b/>' : ''}<w:sz w:val="${options.size || 22}"/><w:szCs w:val="${options.size || 22}"/></w:rPr><w:t xml:space="preserve">${escapeXml(value || ' ')}</w:t></w:r></w:p>`
}

function wordImage(image: WordImage, width: number, height: number, description: string) {
  const cx = Math.round(width * 9525); const cy = Math.round(height * 9525)
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="100"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${image.id.replace(/\D/g, '')}" name="${escapeXml(description)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(image.fileName)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

async function exportReportWord(items: ReportItem[], projectName: string, drawingName: string) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip(); const images: WordImage[] = []; const body: string[] = []
  body.push(wordParagraph('圖紙標記報告', { bold: true, size: 30 }), wordParagraph(`項目：${projectName}`), wordParagraph(`工程圖：${drawingName}`))
  for (const [index, item] of items.entries()) {
    body.push(wordParagraph(markerSummary(item.marker), { bold: true, size: 24, pageBreakBefore: index > 0 }))
    body.push(wordParagraph(`裁切比例：${item.marker.cropScale.toFixed(2)}`))
    try { const image = await loadWordImage(item.crop.toDataURL('image/jpeg', 0.93), images.length + 1); images.push(image); body.push(wordImage(image, 620, 410, `標記 ${item.marker.number} 圖紙裁切`)) } catch { body.push(wordParagraph('圖紙裁切無法載入')) }
    if (!item.photos.length) body.push(wordParagraph('沒有關聯相片（此項目仍保留）。'))
    for (const [photoIndex, entry] of item.photos.entries()) {
      body.push(wordParagraph(`相片 ${photoIndex + 1}`, { bold: true }))
      if (entry.photo) {
        body.push(wordParagraph(`類別：${entry.photo.category}`))
        const tagText = Object.entries(entry.photo.tags || {}).filter(([, value]) => value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join('；')
        if (tagText) body.push(wordParagraph(`標籤：${tagText}`))
        if (entry.photo.note) body.push(wordParagraph(`備註：${entry.photo.note}`))
      }
      if (entry.source) { try { const image = await loadWordImage(entry.source, images.length + 1); images.push(image); body.push(wordImage(image, 470, 300, `標記 ${item.marker.number} 相片 ${photoIndex + 1}`)) } catch { body.push(wordParagraph('相片檔案無法載入')) } }
      else body.push(wordParagraph(`⚠ ${entry.missingReason || '相片檔案無法使用'}`))
    }
  }
  const relationships = images.map(image => `<Relationship Id="${image.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`).join('')
  const defaults = Array.from(new Map(images.map(image => [image.fileName.split('.').pop(), image.contentType])).entries()).map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`).join('')
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`)
  zip.folder('_rels')?.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdOfficeDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr></w:body></w:document>`)
  zip.folder('word')?.file('styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft JhengHei"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style></w:styles>')
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relationships}</Relationships>`)
  images.forEach(image => zip.folder('word')?.folder('media')?.file(image.fileName, image.data))
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' })
}

async function exportMarkedDrawingPdfBlob(drawing: DrawingDocument, status?: (value: string) => void) {
  const [{ jsPDF: JsPDF }, tools] = await Promise.all([import('jspdf'), drawingPdfTools()])
  const pdf = await tools.loadDrawingPdf(drawing.pdf)
  let output: InstanceType<typeof JsPDF> | null = null
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(drawing.pageCount, pdf.numPages); pageNumber += 1) {
      status?.(`正在匯出圖紙 ${pageNumber}/${Math.min(drawing.pageCount, pdf.numPages)}`)
      const rendered = await renderCanonicalPage(pdf, pageNumber, tools)
      const pageRotation = safeRotation(rendered.page.rotate)
      const markedCanonical = drawCanonicalMarkup(rendered.canvas, drawing, pageNumber)
      const natural = toNaturalOrientation(markedCanonical, pageRotation)
      const viewport = rendered.page.getViewport({ scale: 1, rotation: 0 })
      const widthPoints = pageRotation === 90 || pageRotation === 270 ? viewport.height : viewport.width
      const heightPoints = pageRotation === 90 || pageRotation === 270 ? viewport.width : viewport.height
      const widthMm = widthPoints * 25.4 / 72; const heightMm = heightPoints * 25.4 / 72
      const orientation = widthMm > heightMm ? 'landscape' : 'portrait'
      if (!output) output = new JsPDF({ unit: 'mm', format: [widthMm, heightMm], orientation, compress: true })
      else output.addPage([widthMm, heightMm], orientation)
      output.addImage(natural.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, widthMm, heightMm, undefined, 'FAST')
      rendered.page.cleanup?.()
    }
    if (!output) throw new Error('圖紙沒有可匯出的頁面')
    return output.output('blob') as Blob
  } finally { await pdf.destroy?.() }
}

export async function exportMarkedDrawingPdf(drawing: DrawingDocument): Promise<void> {
  requireBrowser()
  const blob = await exportMarkedDrawingPdfBlob(drawing)
  await shareOrDownload(blob, `${drawing.name || '圖紙'}-已標記.pdf`, '已標記圖紙 PDF')
}

function makeButton(label: string, ariaLabel?: string) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', ariaLabel || label); button.style.cssText = 'border:1px solid #aab7c1;border-radius:6px;background:#fff;color:#17212b;padding:7px 11px;cursor:pointer;font:inherit;'; return button
}

export async function openDrawingReportPreview(drawing: DrawingDocument, markers: DrawingMarker[], photos: Photo[], projectName: string): Promise<void> {
  requireBrowser()
  const workingMarkers: ReportMarker[] = markers.slice().sort((a, b) => a.number - b.number).map(marker => ({ ...marker, tags: { ...marker.tags }, photoIds: [...marker.photoIds], cropScale: cropScale(marker.cropScale) }))
  const selected = new Set(workingMarkers.map(marker => marker.id))
  const preview = document.createElement('div')
  preview.setAttribute('role', 'dialog'); preview.setAttribute('aria-modal', 'true'); preview.setAttribute('aria-labelledby', 'drawing-report-title'); preview.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(11,22,31,.62);display:flex;align-items:stretch;justify-content:center;padding:18px;box-sizing:border-box;'
  const panel = document.createElement('section'); panel.style.cssText = 'width:min(1180px,100%);height:100%;overflow:auto;background:#f6f8fa;color:#17212b;border-radius:12px;box-shadow:0 20px 70px rgba(0,0,0,.3);padding:22px;box-sizing:border-box;'; preview.appendChild(panel)
  const header = document.createElement('header'); header.style.cssText = 'display:flex;gap:14px;align-items:flex-start;justify-content:space-between;position:sticky;top:-22px;background:#f6f8fa;padding:4px 0 14px;z-index:2;'; panel.appendChild(header)
  const titleBlock = document.createElement('div'); const title = document.createElement('h1'); title.id = 'drawing-report-title'; title.textContent = '圖紙標記報告預覽'; title.style.cssText = 'margin:0;font-size:24px;'; titleBlock.appendChild(title); const subtitle = document.createElement('p'); subtitle.textContent = `${projectName || '未命名項目'}　·　${drawing.name || drawing.fileName}`; subtitle.style.cssText = 'margin:5px 0;color:#50606c;'; titleBlock.appendChild(subtitle); header.appendChild(titleBlock)
  let removePreview = () => undefined
  const close = makeButton('關閉', '關閉圖紙報告預覽'); close.addEventListener('click', () => removePreview()); header.appendChild(close)
  const controls = document.createElement('div'); controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0 16px;border-bottom:1px solid #d4dde3;'; panel.appendChild(controls)
  const filter = document.createElement('input'); filter.type = 'search'; filter.placeholder = '篩選編號、頁碼、房間或類別'; filter.setAttribute('aria-label', '篩選標記'); filter.style.cssText = 'min-width:260px;flex:1;border:1px solid #aab7c1;border-radius:6px;padding:9px;font:inherit;'; controls.appendChild(filter)
  const selectAll = makeButton('全選'); const clearAll = makeButton('清除選取'); controls.append(selectAll, clearAll)
  const exportReport = makeButton('匯出報告 PDF'); const exportWord = makeButton('匯出 Word'); const exportMarked = makeButton('匯出已標記圖紙 PDF'); controls.append(exportReport, exportWord, exportMarked)
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.style.cssText = 'min-height:22px;margin:12px 0;color:#405765;'; panel.appendChild(status)
  const list = document.createElement('div'); list.style.cssText = 'display:grid;gap:12px;'; panel.appendChild(list)
  const previewCrops = new Map<string, string>()
  let previewGeneration = 0
  const setStatus = (value: string, error = false) => { status.textContent = value; status.style.color = error ? '#a32222' : '#405765' }
  const renderList = () => {
    list.replaceChildren()
    const query = filter.value.trim().toLocaleLowerCase('zh-HK')
    workingMarkers.forEach((marker, index) => {
      const haystack = `${marker.number} ${marker.page} ${marker.roomName} ${marker.category} ${Object.values(marker.tags || {}).join(' ')} ${marker.note}`.toLocaleLowerCase('zh-HK')
      if (query && !haystack.includes(query)) return
      const row = document.createElement('article'); row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;background:#fff;border:1px solid #d4dde3;border-radius:8px;padding:13px;';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(marker.id); checkbox.setAttribute('aria-label', `選取標記 ${marker.number}`); checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(marker.id); else selected.delete(marker.id) }); row.appendChild(checkbox)
      const content = document.createElement('div'); const heading = document.createElement('h2'); heading.textContent = `標記 ${marker.number}　·　第 ${marker.page} 頁　·　${text(marker.roomName, '未確認')}`; heading.style.cssText = 'font-size:18px;margin:0 0 5px;'; content.appendChild(heading); const detail = document.createElement('p'); detail.textContent = `${text(marker.category)}${marker.note ? `　${marker.note}` : ''}`; detail.style.cssText = 'margin:0 0 8px;color:#50606c;white-space:pre-wrap;'; content.appendChild(detail)
      const cropPreview = previewCrops.get(marker.id)
      if (cropPreview) { const image = document.createElement('img'); image.src = cropPreview; image.alt = `標記 ${marker.number} 裁切預覽`; image.style.cssText = 'display:block;width:min(360px,100%);height:150px;object-fit:contain;object-position:left center;border:1px solid #d4dde3;background:#f4f7f9;margin:6px 0 10px;'; content.appendChild(image) }
      const sliderLabel = document.createElement('label'); sliderLabel.textContent = '裁切比例（較大 = 放大）'; sliderLabel.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:14px;'; const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0.5'; slider.max = '3'; slider.step = '0.05'; slider.value = String(marker.cropScale); slider.setAttribute('aria-label', `調整標記 ${marker.number} 裁切比例`); slider.addEventListener('input', () => { marker.cropScale = cropScale(Number(slider.value)); value.textContent = marker.cropScale.toFixed(2); }); const value = document.createElement('output'); value.textContent = marker.cropScale.toFixed(2); sliderLabel.append(slider, value); content.appendChild(sliderLabel); row.appendChild(content)
      const order = document.createElement('div'); order.style.cssText = 'display:flex;gap:6px;'; const up = makeButton('↑', `將標記 ${marker.number} 上移`); const down = makeButton('↓', `將標記 ${marker.number} 下移`); up.disabled = index === 0; down.disabled = index === workingMarkers.length - 1; up.addEventListener('click', () => { [workingMarkers[index - 1], workingMarkers[index]] = [workingMarkers[index], workingMarkers[index - 1]]; renderList() }); down.addEventListener('click', () => { [workingMarkers[index + 1], workingMarkers[index]] = [workingMarkers[index], workingMarkers[index + 1]]; renderList() }); order.append(up, down); row.appendChild(order); list.appendChild(row)
    })
    if (!list.childElementCount) { const empty = document.createElement('p'); empty.textContent = '沒有符合篩選條件的標記。'; list.appendChild(empty) }
  }
  filter.addEventListener('input', renderList); selectAll.addEventListener('click', () => { workingMarkers.forEach(marker => selected.add(marker.id)); renderList() }); clearAll.addEventListener('click', () => { selected.clear(); renderList() });
  const refreshCropPreviews = async () => {
    const generation = ++previewGeneration
    try {
      setStatus('正在建立裁切預覽…')
      const items = await buildReportItems(drawing, workingMarkers, [], setStatus)
      if (generation !== previewGeneration) return
      previewCrops.clear(); items.forEach(item => previewCrops.set(item.marker.id, item.crop.toDataURL('image/jpeg', 0.9))); renderList(); setStatus(`${workingMarkers.length} 個標記可供選取。`)
    } catch (error) { if (generation === previewGeneration) setStatus(`裁切預覽載入失敗：${error instanceof Error ? error.message : '未知錯誤'}`, true) }
  }
  list.addEventListener('change', event => { const target = event.target; if (target instanceof HTMLInputElement && target.type === 'range') void refreshCropPreviews() })
  const chosenItems = async () => { const chosen = workingMarkers.filter(marker => selected.has(marker.id)); if (!chosen.length) throw new Error('請至少選取一個標記') ; return buildReportItems(drawing, chosen, photos, setStatus) }
  exportReport.addEventListener('click', () => void (async () => { try { exportReport.disabled = true; setStatus('正在建立 PDF 報告…'); const items = await chosenItems(); const blob = await exportReportPdf(items, projectName, drawing.name || drawing.fileName); await shareOrDownload(blob, `${drawing.name || '圖紙'}-標記報告.pdf`, '圖紙標記報告 PDF'); setStatus('PDF 報告已準備完成') } catch (error) { setStatus(`PDF 報告匯出失敗：${error instanceof Error ? error.message : '未知錯誤'}`, true) } finally { exportReport.disabled = false } })())
  exportWord.addEventListener('click', () => void (async () => { try { exportWord.disabled = true; setStatus('正在建立 Word 報告…'); const items = await chosenItems(); const blob = await exportReportWord(items, projectName, drawing.name || drawing.fileName); await shareOrDownload(blob, `${drawing.name || '圖紙'}-標記報告.docx`, '圖紙標記報告 Word'); setStatus('Word 報告已準備完成') } catch (error) { setStatus(`Word 報告匯出失敗：${error instanceof Error ? error.message : '未知錯誤'}`, true) } finally { exportWord.disabled = false } })())
  exportMarked.addEventListener('click', () => void (async () => { try { exportMarked.disabled = true; setStatus('正在建立已標記圖紙…'); await exportMarkedDrawingPdf(drawing); setStatus('已標記圖紙 PDF 已準備完成') } catch (error) { setStatus(`已標記圖紙匯出失敗：${error instanceof Error ? error.message : '未知錯誤'}`, true) } finally { exportMarked.disabled = false } })())
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') removePreview() }
  removePreview = () => { window.removeEventListener('keydown', onKey); preview.remove() }
  preview.addEventListener('keydown', onKey); window.addEventListener('keydown', onKey); document.body.appendChild(preview); renderList(); setStatus(`${workingMarkers.length} 個標記可供選取。`); void refreshCropPreviews()
}

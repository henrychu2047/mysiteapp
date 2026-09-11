import 'client-only'

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

import type { DrawingPoint, DrawingRoomLabel } from './drawing-types'

const PDF_WORKER_URL = '/drawing/pdfjs/pdf.worker.min.mjs'
const OCR_WORKER_URL = '/drawing/ocr/worker.min.js'
const OCR_CORE_URL = '/drawing/ocr/core'
// These are downloads only. Tesseract caches them in the browser's IndexedDB
// after the first successful use; no PDF, image, or recognition result is sent.
const OCR_LANGUAGE_URL = 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best_int'

const DEFAULT_RENDER_MAX_DIMENSION = 2048
const HARD_RENDER_MAX_DIMENSION = 4096
const MAX_RENDER_PIXELS = 16_777_216
const OCR_SCALE = 2
const OCR_TILE_DIMENSION = 1600
const OCR_TILE_OVERLAP = 32
const OCR_MAX_TILES = 16
const OCR_MIN_CONFIDENCE = 10

type PdfJs = typeof import('pdfjs-dist')
type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>

type Tile = { x: number; y: number; width: number; height: number }
type BoundingBox = { x0: number; y0: number; x1: number; y1: number }
type PdfTextItem = {
  str: string; transform: number[]; width: number; height: number
}

function assertBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('圖紙 PDF 功能僅可在瀏覽器中使用')
  }
}

function abortError(reason?: unknown) {
  if (reason instanceof Error) return reason
  return new DOMException(typeof reason === 'string' ? reason : '操作已取消', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal.reason)
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function assertPageNumber(pdf: PDFDocumentProxy, page: number) {
  if (!Number.isInteger(page) || page < 1 || page > pdf.numPages) {
    throw new RangeError(`圖紙頁碼必須介於 1 至 ${pdf.numPages}`)
  }
}

function stableId(prefix: string, parts: Array<string | number>) {
  let hash = 2166136261
  const input = parts.join('|')
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

async function pdfJs(): Promise<PdfJs> {
  assertBrowser()
  const module = await import('pdfjs-dist')
  module.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL
  return module
}

function textItemBounds(item: PdfTextItem, viewport: ReturnType<PDFPageProxy['getViewport']>): BoundingBox | null {
  const [a, b, c, d, e, f] = item.transform.map(Number)
  if (![a, b, c, d, e, f, item.width, item.height].every(Number.isFinite)) return null

  const [va, vb, vc, vd, ve, vf] = viewport.transform
  const txA = va * a + vc * b
  const txB = vb * a + vd * b
  const txC = va * c + vc * d
  const txD = vb * c + vd * d
  const x = va * e + vc * f + ve
  const y = vb * e + vd * f + vf
  const horizontalLength = Math.abs(item.width) * viewport.scale
  const transformWidth = Math.hypot(txA, txB)
  const fontHeight = Math.hypot(txC, txD) || Math.abs(item.height) * viewport.scale
  if (!isFinitePositive(horizontalLength || transformWidth) || !isFinitePositive(fontHeight)) return null

  const unitX = transformWidth ? txA / transformWidth : 1
  const unitY = transformWidth ? txB / transformWidth : 0
  const width = horizontalLength || transformWidth
  const points = [
    [x, y],
    [x + unitX * width, y + unitY * width],
    [x + txC, y + txD],
    [x + unitX * width + txC, y + unitY * width + txD],
  ]
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

function normalizedLabel(
  source: DrawingRoomLabel['source'],
  page: number,
  text: string,
  bounds: BoundingBox,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
  confidence?: number,
): DrawingRoomLabel | null {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned || !isFinitePositive(viewport.width) || !isFinitePositive(viewport.height)) return null
  const x0 = clamp(bounds.x0 / viewport.width)
  const y0 = clamp(bounds.y0 / viewport.height)
  const x1 = clamp(bounds.x1 / viewport.width)
  const y1 = clamp(bounds.y1 / viewport.height)
  if (x1 <= x0 || y1 <= y0) return null
  const label: DrawingRoomLabel = {
    id: stableId(source, [page, cleaned, Math.round(x0 * 10000), Math.round(y0 * 10000), Math.round(x1 * 10000), Math.round(y1 * 10000)]),
    page,
    text: cleaned,
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    source,
  }
  if (source === 'ocr' && typeof confidence === 'number' && Number.isFinite(confidence)) label.confidence = clamp(confidence, 0, 100)
  return label
}

function bindRenderAbort(task: { cancel: () => void }, signal?: AbortSignal) {
  const cancel = () => task.cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  return () => signal?.removeEventListener('abort', cancel)
}

async function renderTile(page: PDFPageProxy, viewport: ReturnType<PDFPageProxy['getViewport']>, tile: Tile, signal?: AbortSignal) {
  throwIfAborted(signal)
  const canvas = document.createElement('canvas')
  canvas.width = tile.width
  canvas.height = tile.height
  const canvasContext = canvas.getContext('2d', { alpha: false })
  if (!canvasContext) throw new Error('圖紙頁面無法建立繪圖畫布')
  const task = page.render({
    canvas,
    canvasContext,
    viewport,
    transform: [1, 0, 0, 1, -tile.x, -tile.y],
    background: 'rgb(255,255,255)',
  })
  const unbind = bindRenderAbort(task, signal)
  try {
    await task.promise
    throwIfAborted(signal)
    return canvas
  } catch (error) {
    if (signal?.aborted) throw abortError(signal.reason)
    throw error
  } finally {
    unbind()
  }
}

function ocrTiles(viewport: ReturnType<PDFPageProxy['getViewport']>) {
  let scale = OCR_SCALE
  const fitsTileBudget = () => Math.ceil(viewport.width * scale / OCR_TILE_DIMENSION) * Math.ceil(viewport.height * scale / OCR_TILE_DIMENSION) <= OCR_MAX_TILES
  while (!fitsTileBudget() && scale > 0.25) scale *= 0.9
  const scaledWidth = Math.max(1, Math.ceil(viewport.width * scale))
  const scaledHeight = Math.max(1, Math.ceil(viewport.height * scale))
  const tiles: Tile[] = []
  for (let y = 0; y < scaledHeight; y += OCR_TILE_DIMENSION - OCR_TILE_OVERLAP) {
    for (let x = 0; x < scaledWidth; x += OCR_TILE_DIMENSION - OCR_TILE_OVERLAP) {
      tiles.push({
        x,
        y,
        width: Math.min(OCR_TILE_DIMENSION, scaledWidth - x),
        height: Math.min(OCR_TILE_DIMENSION, scaledHeight - y),
      })
    }
  }
  return { scale, tiles }
}

function labelOverlap(a: DrawingRoomLabel, b: DrawingRoomLabel) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top)
  const union = a.width * a.height + b.width * b.height - intersection
  return union > 0 ? intersection / union : 0
}

function deduplicateOcrLabels(labels: DrawingRoomLabel[]) {
  return labels
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .reduce<DrawingRoomLabel[]>((unique, label) => {
      const duplicate = unique.some(candidate => candidate.text === label.text && labelOverlap(candidate, label) >= 0.5)
      if (!duplicate) unique.push(label)
      return unique
    }, [])
}

function ocrWords(data: Awaited<ReturnType<OcrWorker['recognize']>>['data']) {
  return (data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words)))
}

/** Loads a PDF locally. Call this from a Client Component only. */
export async function loadDrawingPdf(blob: Blob): Promise<PDFDocumentProxy> {
  assertBrowser()
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('PDF 檔案是空白的，請重新選取圖紙')
  if (blob.type && blob.type !== 'application/pdf' && blob.type !== 'application/x-pdf') {
    throw new Error('請選擇 PDF 圖紙檔案')
  }
  const header = new TextDecoder('latin1').decode(await blob.slice(0, 1024).arrayBuffer())
  if (!header.includes('%PDF-')) throw new Error('檔案不是有效的 PDF，請重新匯出或選取圖紙')

  const pdfjs = await pdfJs()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let loadingTask: ReturnType<PdfJs['getDocument']> | undefined
  try {
    loadingTask = pdfjs.getDocument({ data: bytes, disableAutoFetch: true, stopAtErrors: true })
    const pdf = await loadingTask.promise
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) {
      throw new Error('PDF 沒有可顯示的頁面')
    }
    return pdf
  } catch (error) {
    await loadingTask?.destroy()
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new Error('此 PDF 已加密，請先移除密碼後再匯入')
    }
    if (error instanceof Error && error.message) {
      throw new Error(`無法讀取 PDF：${error.message}`)
    }
    throw new Error('無法讀取 PDF；檔案可能已損壞或格式不受支援')
  }
}

/** Renders a bounded page canvas. rotation=0 is the canonical coordinate view. */
export async function renderDrawingPage(
  pdf: PDFDocumentProxy,
  page: number,
  options: { maxDimension?: number; rotation?: number; signal?: AbortSignal } = {},
): Promise<HTMLCanvasElement> {
  assertBrowser()
  assertPageNumber(pdf, page)
  throwIfAborted(options.signal)
  const requestedDimension = options.maxDimension ?? DEFAULT_RENDER_MAX_DIMENSION
  if (!isFinitePositive(requestedDimension)) throw new RangeError('最大繪圖尺寸必須大於 0')
  const maxDimension = Math.min(Math.floor(requestedDimension), HARD_RENDER_MAX_DIMENSION)
  const rotation = options.rotation ?? 0
  if (!Number.isFinite(rotation) || rotation % 90 !== 0) throw new RangeError('圖紙旋轉角度必須為 90 度的倍數')
  const pdfPage = await pdf.getPage(page)
  throwIfAborted(options.signal)
  const baseViewport = pdfPage.getViewport({ scale: 1, rotation })
  const dimensionScale = maxDimension / Math.max(baseViewport.width, baseViewport.height)
  const pixelScale = Math.sqrt(MAX_RENDER_PIXELS / (baseViewport.width * baseViewport.height))
  const viewport = pdfPage.getViewport({ scale: Math.min(dimensionScale, pixelScale), rotation })
  return renderTile(pdfPage, viewport, { x: 0, y: 0, width: Math.max(1, Math.ceil(viewport.width)), height: Math.max(1, Math.ceil(viewport.height)) }, options.signal)
}

/** Extracts selectable PDF text in canonical, CropBox-relative coordinates. */
export async function extractDrawingRoomLabels(pdf: PDFDocumentProxy, page: number): Promise<DrawingRoomLabel[]> {
  assertBrowser()
  assertPageNumber(pdf, page)
  const pdfPage = await pdf.getPage(page)
  const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 })
  const content = await pdfPage.getTextContent()
  return content.items.flatMap((item, index) => {
    if (!('str' in item)) return []
    const textItem = item as PdfTextItem
    const bounds = textItemBounds(textItem, viewport)
    const label = bounds && normalizedLabel('pdf-text', page, textItem.str, bounds, viewport)
    return label ? [{ ...label, id: stableId('pdf-text', [page, index, label.id]) }] : []
  })
}

/**
 * Recognizes Traditional Chinese and English words on a drawing without
 * uploading the drawing. This runs one bounded, cancellable local worker.
 */
export async function recognizeDrawingRooms(
  pdf: PDFDocumentProxy,
  page: number,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {},
): Promise<DrawingRoomLabel[]> {
  assertBrowser()
  assertPageNumber(pdf, page)
  throwIfAborted(options.signal)
  const report = (progress: number) => options.onProgress?.(clamp(progress))
  report(0)
  const pdfPage = await pdf.getPage(page)
  const canonicalViewport = pdfPage.getViewport({ scale: 1, rotation: 0 })
  const { scale, tiles } = ocrTiles(canonicalViewport)
  const viewport = pdfPage.getViewport({ scale, rotation: 0 })
  const tesseract = await import('tesseract.js')
  let lastProgress = 0
  let tileIndex = 0
  let worker: OcrWorker | undefined
  const terminate = () => { void worker?.terminate() }
  options.signal?.addEventListener('abort', terminate, { once: true })
  try {
    worker = await tesseract.createWorker('chi_tra+eng', 1, {
      workerPath: OCR_WORKER_URL,
      workerBlobURL: false,
      corePath: OCR_CORE_URL,
      langPath: OCR_LANGUAGE_URL,
      cacheMethod: 'write',
      logger: message => {
        const workerProgress = Number.isFinite(message.progress) ? message.progress : 0
        const progress = 0.1 * workerProgress + 0.9 * ((tileIndex + workerProgress) / tiles.length)
        lastProgress = Math.max(lastProgress, progress)
        report(lastProgress)
      },
    })
    throwIfAborted(options.signal)
    await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
    const labels: DrawingRoomLabel[] = []
    for (tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
      throwIfAborted(options.signal)
      const tile = tiles[tileIndex]
      const canvas = await renderTile(pdfPage, viewport, tile, options.signal)
      const result = await worker.recognize(canvas, {}, { blocks: true })
      throwIfAborted(options.signal)
      for (const word of ocrWords(result.data)) {
        if (word.confidence < OCR_MIN_CONFIDENCE) continue
        const bounds: BoundingBox = {
          x0: tile.x + word.bbox.x0,
          y0: tile.y + word.bbox.y0,
          x1: tile.x + word.bbox.x1,
          y1: tile.y + word.bbox.y1,
        }
        const label = normalizedLabel('ocr', page, word.text, bounds, viewport, word.confidence)
        if (label) labels.push(label)
      }
      lastProgress = Math.max(lastProgress, (tileIndex + 1) / tiles.length)
      report(lastProgress)
    }
    report(1)
    return deduplicateOcrLabels(labels)
  } catch (error) {
    if (options.signal?.aborted) throw abortError(options.signal.reason)
    throw error
  } finally {
    options.signal?.removeEventListener('abort', terminate)
    await worker?.terminate()
  }
}

/** Returns nearby labels as suggestions only; callers must not treat them as room ownership. */
export function suggestDrawingRooms(labels: DrawingRoomLabel[], page: number, point: DrawingPoint, limit = 5): DrawingRoomLabel[] {
  if (!Number.isInteger(page) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return []
  if (!Number.isInteger(limit) || limit < 1) return []
  const maxResults = Math.min(limit, 10)
  return labels
    .filter(label => {
      if (label.page !== page || !label.text.trim() || !Number.isFinite(label.x) || !Number.isFinite(label.y)) return false
      if (label.width <= 0 || label.height <= 0 || label.width > 0.5 || label.height > 0.2) return false
      return label.source !== 'ocr' || (label.confidence ?? 0) >= 35
    })
    .map(label => {
      const centerX = label.x + label.width / 2
      const centerY = label.y + label.height / 2
      const dx = Math.max(0, Math.abs(point.x - centerX) - label.width / 2)
      const dy = Math.max(0, Math.abs(point.y - centerY) - label.height / 2)
      return { label, distance: Math.hypot(dx, dy) }
    })
    .filter(candidate => candidate.distance <= 0.15)
    .sort((a, b) => a.distance - b.distance || (b.label.confidence || 100) - (a.label.confidence || 100))
    .slice(0, maxResults)
    .map(candidate => candidate.label)
}

import ExcelJS from 'exceljs'
import { imageAsJpeg } from '@/lib/photo-image'
import type { Photo } from '@/lib/photo-storage'

const selectedPhotos = (photos: Photo[], selectedIds: string[]) => photos.filter(photo => selectedIds.includes(photo.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
const photoDetail = (photo: Photo, separator: string) => Object.entries(photo.tags).filter(([key, value]) => key !== '備註' && value && value !== 'N/A').map(([key, value]) => `${key}: ${value}`).join(separator)
const photoNote = (photo: Photo) => photo.note || (photo.tags['備註'] === 'N/A' ? '' : photo.tags['備註']) || ''

export async function exportPhotoExcel(photos: Photo[], selectedIds: string[]) {
  const chosen = selectedPhotos(photos, selectedIds)
  if (!chosen.length) { alert('請先勾選要匯出的相片'); return }
  try {
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('相片記錄')
    sheet.columns = [{ header: '日期', key: 'date', width: 16 }, { header: '時間', key: 'time', width: 14 }, { header: '類別', key: 'category', width: 18 }, { header: '細項說明', key: 'detail', width: 34 }, { header: '備註', key: 'note', width: 28 }, { header: '照片', key: 'photo', width: 28 }]
    for (const photo of chosen) {
      const capturedAt = new Date(photo.createdAt)
      const row = sheet.addRow({ date: capturedAt.toLocaleDateString('zh-HK'), time: capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }), category: photo.category, detail: photoDetail(photo, '\n'), note: photoNote(photo) })
      const imageId = book.addImage({ base64: await imageAsJpeg(photo.cleanSrc), extension: 'jpeg' })
      sheet.addImage(imageId, { tl: { col: 5, row: row.number - 1 }, ext: { width: 165, height: 165 } })
      row.height = 130
    }
    const buffer = await book.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a')
    link.href = url
    link.download = '地盤相片記錄.xlsx'
    document.body.appendChild(link)
    link.click()
    setTimeout(() => { link.remove(); URL.revokeObjectURL(url) }, 3000)
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share && typeof File !== 'undefined') {
      const file = new File([buffer], '地盤相片記錄.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '地盤相片記錄.xlsx' })
    }
  } catch (error) {
    console.error('[v0] ExcelJS export failed:', error)
    alert(`Excel 匯出失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
  }
}

export function openPhotoPdfPreview(photos: Photo[], selectedIds: string[]) {
  const chosen = selectedPhotos(photos, selectedIds)
  if (!chosen.length) { alert('請先勾選要匯出的相片'); return }
  const preview = document.createElement('div')
  preview.className = 'export-preview-overlay'
  preview.innerHTML = `<div class="export-backdrop"></div><div class="export-report-preview"><h1>地盤相片記錄報表（A3 橫向排版）</h1><div class="export-report-head"><b>日期</b><b>時間</b><b>類別</b><b>細項說明</b><b>備註</b><b>照片</b></div>${chosen.map(photo => { const capturedAt = new Date(photo.createdAt); return `<article><div>${capturedAt.toLocaleDateString('zh-HK')}</div><div>${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div>${photo.category}</div><div>${photoDetail(photo, '<br>') || '—'}</div><div>${photo.note || photo.tags['備註'] || '—'}</div><img src="${photo.src}" alt="${photo.category}相片"></article>` }).join('')}</div><div class="export-sheet"><div class="sheet-handle"></div><button class="export-back" id="close-report" aria-label="返回上一頁">‹</button><h2>地盤相片記錄報表預覽（A3 橫向）</h2><div class="export-sheet-actions"><button id="print-report">匯出報告</button><button class="export-close" id="close-report-2">關閉</button></div></div>`
  document.body.appendChild(preview)
  preview.querySelector('#close-report')?.addEventListener('click', () => preview.remove())
  preview.querySelector('#close-report-2')?.addEventListener('click', () => preview.remove())
  preview.querySelector('#print-report')?.addEventListener('click', () => void exportPhotoPdf(chosen))
}

async function exportPhotoPdf(chosen: Photo[]) {
  let html2canvas: typeof import('html2canvas').default
  let JsPDF: (typeof import('jspdf')).jsPDF
  try {
    const [canvasModule, pdfModule] = await Promise.all([import('html2canvas'), import('jspdf')])
    html2canvas = canvasModule.default
    JsPDF = pdfModule.jsPDF
    if (typeof html2canvas !== 'function' || typeof JsPDF !== 'function') throw new Error('PDF 模組格式不正確')
  } catch (error) {
    console.error('[v0] PDF module load failed:', error)
    alert('PDF 模組載入失敗，請重新整理頁面後再試')
    return
  }
  const report = document.createElement('div')
  report.style.cssText = `position:absolute;left:0;top:0;width:1120px;min-height:${Math.max(520, chosen.length * 180 + 100)}px;display:block;visibility:visible;opacity:1;overflow:visible;background:#fff;color:#15212b;padding:24px;z-index:999999;pointer-events:none;`
  report.innerHTML = `<div style="height:64px"></div><div style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;background:#e5e9ee;font-weight:700;padding:12px">${['日期','時間','類別','細項說明','備註','照片'].map(label => `<div style="padding:10px;border-right:1px solid #ccd4db">${label}</div>`).join('')}</div>` + chosen.map(photo => { const capturedAt = new Date(photo.createdAt); return `<article style="display:grid;grid-template-columns:145px 125px 125px 220px 175px 190px;align-items:center;border-top:1px solid #d8e0e5;padding:14px 0;break-inside:avoid;min-height:150px"><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleDateString('zh-HK')}</div><div style="padding:10px;white-space:nowrap">${capturedAt.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div style="padding:10px;overflow-wrap:anywhere">${photo.category}</div><div style="padding:10px;overflow-wrap:anywhere">${photoDetail(photo, '<br>') || '—'}</div><div style="padding:10px;overflow-wrap:anywhere">${photoNote(photo) || '—'}</div><img src="${photo.src}" width="165" height="125" style="display:block;width:165px;height:125px;object-fit:cover"/></article>` }).join('')
  document.body.appendChild(report)
  await Promise.all(Array.from(report.querySelectorAll('img')).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => { image.onload = () => resolve(); image.onerror = () => resolve() })))
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  try {
    const heading = document.createElement('div')
    heading.style.cssText = 'position:absolute;left:0;top:0;width:1120px;height:64px;background:#fff;color:#15212b;padding:20px 24px;font-size:22px;font-weight:700;box-sizing:border-box;z-index:1000000;'
    heading.textContent = '地盤相片記錄報表（A3 橫向排版）'
    document.body.appendChild(heading)
    const headingCanvas = await html2canvas(heading, { scale: 1.5, backgroundColor: '#ffffff', windowWidth: 1120 })
    heading.remove()
    const canvas = await html2canvas(report, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', windowWidth: 1120 })
    const pdfDocument = new JsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' })
    const pageWidth = pdfDocument.internal.pageSize.getWidth(); const pageHeight = pdfDocument.internal.pageSize.getHeight(); const margin = 8; const headingHeight = 12; const printableWidth = pageWidth - margin * 2; const printableHeight = pageHeight - margin * 2 - headingHeight; const pixelsPerMm = canvas.width / printableWidth; const pagePixels = Math.floor(printableHeight * pixelsPerMm)
    let sourceY = 0; let pageIndex = 0
    while (sourceY < canvas.height) {
      if (pageIndex > 0) pdfDocument.addPage()
      const sliceHeight = Math.min(pagePixels, canvas.height - sourceY); const pageCanvas = document.createElement('canvas'); pageCanvas.width = canvas.width; pageCanvas.height = sliceHeight; const pageContext = pageCanvas.getContext('2d'); if (!pageContext) throw new Error('PDF page canvas unavailable')
      pageContext.fillStyle = '#fff'; pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height); pageContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      pdfDocument.addImage(headingCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, printableWidth, headingHeight); pdfDocument.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin + headingHeight, printableWidth, sliceHeight / pixelsPerMm)
      sourceY += sliceHeight; pageIndex += 1
    }
    const pdfBlob = pdfDocument.output('blob'); const pdfUrl = URL.createObjectURL(pdfBlob); const downloadLink = document.createElement('a'); downloadLink.href = pdfUrl; downloadLink.download = '地盤相片報表.pdf'; downloadLink.rel = 'noopener'; document.body.appendChild(downloadLink); downloadLink.click(); downloadLink.remove()
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && navigator.share && typeof File !== 'undefined') { const pdfFile = new File([pdfBlob], '地盤相片報表.pdf', { type: 'application/pdf' }); if (navigator.canShare?.({ files: [pdfFile] })) await navigator.share({ files: [pdfFile], title: '地盤相片報表.pdf' }) }
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000)
  } catch (error) {
    console.error('[v0] PDF export failed:', error)
    alert(`PDF 匯出失敗：${error instanceof Error ? error.message : '請稍後再試'}`)
  } finally {
    window.setTimeout(() => report.remove(), 1000)
  }
}

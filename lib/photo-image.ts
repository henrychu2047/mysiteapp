import { createPhotoStampContent, PHOTO_STAMP_STYLE } from '@/lib/photo-stamp'

export function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(',')
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: header.match(/data:([^;]+)/)?.[1] || 'image/jpeg' })
}

export function imageAsJpeg(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('無法建立圖片轉換器'))
      ctx.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    image.onerror = () => reject(new Error('無法轉換原圖'))
    image.src = dataUrl
  })
}

export function stampImage(file: File, category: string, tags: Record<string, string> = {}, note = '', projectName = '', visibleTags?: string[]) {
  return new Promise<{ stamped: string; clean: string; originalBlob: Blob; thumbnailBlob: Blob }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const sourceWidth = image.naturalWidth || image.width
        const sourceHeight = image.naturalHeight || image.height
        const scale = Math.min(1, 4096 / Math.max(sourceWidth, sourceHeight))
        canvas.width = Math.max(1, Math.round(sourceWidth * scale))
        canvas.height = Math.max(1, Math.round(sourceHeight * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('無法建立圖片處理器'))
          return
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        const cleanDataUrl = canvas.toDataURL('image/jpeg', 0.82)
        const originalBlob = dataUrlToBlob(canvas.toDataURL('image/jpeg', 0.78))
        const stamp = createPhotoStampContent({ category, tags, visibleTags, note, projectName })
        const rows = [...stamp.rows, ...(stamp.note ? [{ label: '文字備註', value: stamp.note }] : [])]
        const lines = [stamp.heading, ...rows.map(row => `${row.label}: ${row.value}`)]
        const size = Math.max(18, Math.round(canvas.width / 48))
        const lineHeight = size * 1.35
        ctx.font = `600 ${size}px Arial, sans-serif`
        const width = Math.min(canvas.width * 0.92, Math.max(...lines.map(line => ctx.measureText(line).width)) + size * 1.4)
        const height = lineHeight * lines.length + size * 0.8
        ctx.fillStyle = PHOTO_STAMP_STYLE.background
        ctx.fillRect(canvas.width - width, canvas.height - height, width, height)
        ctx.textBaseline = 'top'
        const textX = canvas.width - width + size * 0.7
        const textY = canvas.height - height + size * 0.4
        ctx.fillStyle = PHOTO_STAMP_STYLE.text
        ctx.fillText(stamp.heading, textX, textY, width - size)
        rows.forEach((row, index) => {
          const y = textY + (index + 1) * lineHeight
          const label = `${row.label}: `
          ctx.fillStyle = PHOTO_STAMP_STYLE.label
          ctx.fillText(label, textX, y, width - size)
          const labelWidth = ctx.measureText(label).width
          ctx.fillStyle = PHOTO_STAMP_STYLE.text
          ctx.fillText(row.value, textX + labelWidth, y, width - size - labelWidth)
        })
        const stamped = canvas.toDataURL('image/jpeg', 0.78)
        const thumbnailCanvas = document.createElement('canvas')
        const thumbnailWidth = Math.min(960, canvas.width)
        thumbnailCanvas.width = thumbnailWidth
        thumbnailCanvas.height = Math.max(1, Math.round(canvas.height * thumbnailWidth / canvas.width))
        thumbnailCanvas.getContext('2d')?.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
        const thumbnailBlob = dataUrlToBlob(thumbnailCanvas.toDataURL('image/webp', 0.72))
        resolve({ stamped, clean: cleanDataUrl, originalBlob, thumbnailBlob })
      }
      image.onerror = () => reject(new Error('無法讀取相片'))
      image.src = reader.result as string
    }
    reader.onerror = () => reject(reader.error || new Error('無法讀取檔案'))
    reader.readAsDataURL(file)
  })
}

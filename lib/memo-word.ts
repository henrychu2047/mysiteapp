import JSZip from 'jszip'
import type { Memo, MemoLetterhead } from '@/components/site-memo/memo-data'
import { resolveAttachmentPhoto, type PhotoSource } from '@/lib/photo-attachments'

type WordImage = { id: string; fileName: string; extension: string; contentType: string; data: Uint8Array }

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const paragraph = (text = '', options: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; after?: number; pageBreakBefore?: boolean } = {}) => {
  const properties = [
    options.align ? `<w:jc w:val="${options.align}"/>` : '',
    `<w:spacing w:line="330" w:lineRule="auto" w:after="${options.after ?? 80}"/>`,
    options.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
  ].join('')
  return `<w:p><w:pPr>${properties}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft JhengHei"/>${options.bold ? '<w:b/>' : ''}<w:sz w:val="${options.size ?? 22}"/><w:szCs w:val="${options.size ?? 22}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text || ' ')}</w:t></w:r></w:p>`
}

const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

const drawing = (image: WordImage, width: number, height: number, description: string) => {
  const cx = Math.round(width * 9525)
  const cy = Math.round(height * 9525)
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="100"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${image.id.replace(/\D/g, '')}" name="${escapeXml(description)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(image.fileName)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

async function loadImage(source: string, index: number): Promise<WordImage> {
  const response = await fetch(source)
  if (!response.ok) throw new Error(`圖片載入失敗 (${response.status})`)
  const contentType = response.headers.get('content-type') || source.match(/^data:([^;,]+)/)?.[1] || 'image/png'
  const extension = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : contentType.includes('gif') ? 'gif' : contentType.includes('bmp') ? 'bmp' : 'png'
  return { id: `rId${index}`, fileName: `image${index}.${extension}`, extension, contentType, data: new Uint8Array(await response.arrayBuffer()) }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function exportMemoWord(memo: Memo, letterhead: MemoLetterhead | undefined, photoSources: Record<string, PhotoSource>, fileName: string) {
  const zip = new JSZip()
  const images: WordImage[] = []
  const addImage = async (source: string) => {
    const image = await loadImage(source, images.length + 1)
    images.push(image)
    return image
  }
  const body: string[] = []

  if (letterhead) {
    try { body.push(drawing(await addImage(letterhead.dataUrl), 610, 92, letterhead.name)) } catch { body.push(paragraph(letterhead.name, { bold: true, size: 26, align: 'center' })) }
  } else {
    body.push(paragraph(memo.sender.jvName, { bold: true, size: 26, align: 'center', after: 40 }))
    body.push(paragraph(memo.sender.address, { size: 19, align: 'center', after: 20 }))
    body.push(paragraph(`Tel: ${memo.sender.tel}    Fax: ${memo.sender.fax}    Email: ${memo.sender.email}`, { size: 19, align: 'center', after: 160 }))
  }
  body.push(paragraph(`Date: ${memo.date}`, { size: 20, after: 20 }))
  body.push(paragraph(`Our Ref: ${memo.refNo}`, { size: 20, after: 20 }))
  body.push(paragraph(memo.delivery, { bold: true, size: 19, align: 'right', after: 120 }))
  body.push(paragraph(memo.recipient.company, { bold: true, size: 24, after: 40 }))
  memo.recipient.addressLines.forEach(line => body.push(paragraph(line, { size: 21, after: 20 })))
  body.push(paragraph(`Attn: ${memo.recipient.attn}`, { size: 21, after: 120 }))
  body.push(paragraph('Dear Sir/Madam,', { size: 22, after: 80 }))
  ;[memo.sender.contractNo, memo.sender.projectTitle, memo.sender.substationTitle].filter(Boolean).forEach(value => body.push(paragraph(value, { bold: true, size: 21, after: 20 })))
  body.push(paragraph(memo.subject, { bold: true, size: 26, after: 140 }))
  memo.roughInput.split(/\r?\n/).forEach(line => body.push(paragraph(line, { size: 22, after: line ? 70 : 130 })))
  if (memo.legalClause.trim()) memo.legalClause.split(/\r?\n/).forEach(line => body.push(paragraph(line, { size: 20, after: line ? 60 : 100 })))
  body.push(paragraph('Yours faithfully,', { size: 21, after: 30 }))
  body.push(paragraph(memo.sender.jvName, { bold: true, size: 21, after: 40 }))
  if (memo.signature) {
    try { body.push(drawing(await addImage(memo.signature), 180, 55, 'Signature')) } catch { body.push(paragraph('____________________________')) }
  } else body.push(paragraph('____________________________'))
  body.push(paragraph(memo.sender.signerName, { bold: true, size: 21, after: 20 }))
  body.push(paragraph(memo.sender.signerRole, { size: 20, after: 20 }))
  body.push(paragraph(`附件：${memo.pdfAttachments.reduce((total, item) => total + item.pages.length, 0) + (memo.photos.length ? 1 : 0)} 份`, { size: 19, align: 'right' }))

  for (let attachmentIndex = 0; attachmentIndex < memo.pdfAttachments.length; attachmentIndex += 1) {
    const attachment = memo.pdfAttachments[attachmentIndex]
    for (const page of attachment.pages) {
      body.push(pageBreak(), paragraph(`附件 ${attachmentIndex + 1}    第 ${page.pageNumber}/${attachment.totalPages} 頁`, { bold: true, size: 21, after: 100 }))
      try { body.push(drawing(await addImage(page.imageUrl), 650, 920, `附件 ${attachmentIndex + 1}`)) } catch { body.push(paragraph('附件圖片無法載入', { align: 'center' })) }
    }
  }

  for (let photoIndex = 0; photoIndex < memo.photos.length; photoIndex += 1) {
    const photo = memo.photos[photoIndex]
    body.push(pageBreak(), paragraph(`照片記錄 (Photo Record)    ${photoIndex + 1}/${memo.photos.length}`, { bold: true, size: 24, after: 120 }))
    const source = resolveAttachmentPhoto(photo.photoId, photo.previewUrl, photoSources)
    if (source) {
      try { body.push(drawing(await addImage(source), 620, 760, photo.tag || photo.name)) } catch { body.push(paragraph('相片無法載入', { align: 'center' })) }
    } else body.push(paragraph('相片已從相簿移除', { align: 'center' }))
    body.push(paragraph(photo.time, { size: 19, align: 'right', after: 50 }))
    body.push(paragraph(photo.tag, { bold: true, size: 22, after: 40 }))
    if (photo.customNote) body.push(paragraph(photo.customNote, { size: 20 }))
  }

  const relationships = images.map(image => `<Relationship Id="${image.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`).join('')
  const imageDefaults = Array.from(new Map(images.map(image => [image.extension, image.contentType])).entries()).map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`).join('')
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageDefaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`)
  zip.folder('_rels')?.file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdOfficeDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`)
  zip.folder('word')?.file('styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft JhengHei"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style></w:styles>')
  zip.folder('word')?.folder('_rels')?.file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relationships}</Relationships>`)
  images.forEach(image => zip.folder('word')?.folder('media')?.file(image.fileName, image.data))
  downloadBlob(await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' }), fileName)
}

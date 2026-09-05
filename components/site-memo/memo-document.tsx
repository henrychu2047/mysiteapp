import type { Memo } from './memo-data'
import { resolveAttachmentPhoto, type PhotoSource } from '@/lib/photo-attachments'

const PHOTOS_PER_PAGE = 4

// A4 portrait document shared by live preview, PDF export and history preview.
export function MemoDocument({ memo, letterhead, photoSources = {}, onZoomImage }: { memo: Memo; letterhead?: { name: string; dataUrl: string }; photoSources?: Record<string, PhotoSource>; onZoomImage?: (url: string) => void }) {
  const attachmentCount = memo.pdfAttachments.reduce((total, a) => total + Math.max(a.totalPages, a.pages.length), 0)
  const photoPages = Array.from(
    { length: Math.ceil(memo.photos.length / PHOTOS_PER_PAGE) },
    (_, pageIndex) => memo.photos.slice(pageIndex * PHOTOS_PER_PAGE, (pageIndex + 1) * PHOTOS_PER_PAGE),
  )

  return (
    <div className="memo-doc">
      <section className={`a4-portrait-page ${letterhead ? 'has-letterhead' : ''}`}>
        {letterhead && <img className="memo-letterhead-page" src={letterhead.dataUrl} alt={letterhead.name} />}
        <header style={{ textAlign: 'center', borderBottom: letterhead ? '0' : '2px solid #111', paddingBottom: '8px', minHeight: letterhead ? '30mm' : undefined }}>
          {!letterhead && <div style={{ fontSize: '14.5px', fontWeight: 700, marginTop: '2px' }}>{memo.sender.jvName}</div>}
          {!letterhead && <div style={{ fontSize: '11.5px', color: '#333', marginTop: '3px', lineHeight: 1.35 }}>
            {memo.sender.address}
            <br />
            Tel: {memo.sender.tel}　Fax: {memo.sender.fax}　Email: {memo.sender.email}
          </div>}
        </header>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '12px' }}>
          <div style={{ fontSize: '12px', lineHeight: 1.28 }}>
            <div>Date: {memo.date}</div>
            <div>Our Ref: {memo.refNo}</div>
          </div>
          <div style={{ fontSize: '11px', border: '1px solid #111', padding: '3px 8px', fontWeight: 700 }}>{memo.delivery}</div>
        </div>

        <div style={{ marginTop: '10px', lineHeight: 1.28 }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{memo.recipient.company}</div>
          {memo.recipient.addressLines.map((line, index) => (
            <div key={index} style={{ fontSize: '13px' }}>
              {line}
            </div>
          ))}
          <div style={{ fontSize: '13px', marginTop: '4px' }}>Attn: {memo.recipient.attn}</div>
          <div style={{ fontSize: '13px', marginTop: '6px' }}>Dear Sir/Madam,</div>
          <div style={{ fontSize: '13px', marginTop: '4px', fontWeight: 700 }}>{memo.sender.contractNo}</div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{memo.sender.projectTitle}</div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{memo.sender.substationTitle}</div>
        </div>

        <h2 style={{ textAlign: 'left', fontSize: '15.5px', fontWeight: 800, margin: '14px 0 8px', color: '#111' }}>{memo.subject}</h2>

        <div style={{ fontSize: '13.5px', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{memo.roughInput}</div>

        {memo.legalClause.trim() && (
          <div style={{ fontSize: '12.5px', lineHeight: 1.4, marginTop: '10px', whiteSpace: 'pre-line' }}>{memo.legalClause}</div>
        )}

        <div style={{ fontSize: '13px', marginTop: '18px' }}>
          <div>Yours faithfully,</div>
          <div style={{ fontWeight: 700, marginTop: '2px' }}>{memo.sender.jvName}</div>
          <div style={{ height: '45px', display: 'flex', alignItems: 'flex-end' }}>
            {memo.signature ? (
              <img src={memo.signature || '/placeholder.svg'} alt="簽名" style={{ maxHeight: '45px' }} />
            ) : (
              <div style={{ width: '180px', borderBottom: '1px dashed #888', height: '1px' }} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{memo.sender.signerName}</div>
              <div>{memo.sender.signerRole}</div>
            </div>
            <div style={{ fontSize: '12px' }}>附件: {attachmentCount + (memo.photos.length ? 1 : 0)} 份</div>
          </div>
        </div>
      </section>

      {memo.pdfAttachments.flatMap((attachment, attachmentIndex) =>
        attachment.pages.map(page => (
          <section className="a4-portrait-page" key={`${attachment.id}-${page.pageNumber}`}>
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
              附件 {attachmentIndex + 1}　第 {page.pageNumber}/{attachment.totalPages} 頁
            </div>
            <img
              src={page.imageUrl || '/placeholder.svg'}
              alt={`圖紙第 ${page.pageNumber} 頁`}
              onClick={() => onZoomImage?.(page.imageUrl)}
              style={{ width: '100%', border: '1px solid #ccc', cursor: onZoomImage ? 'zoom-in' : 'default' }}
            />
          </section>
        )),
      )}

      {photoPages.map((photos, pageIndex) => (
        <section className="a4-portrait-page memo-photo-page" key={`photo-page-${pageIndex}`}>
          <div className="memo-photo-page-heading">
            <span>照片記錄 (Photo Record)</span>
            <span>第 {pageIndex + 1}/{photoPages.length} 頁</span>
          </div>
          <div className="memo-photo-page-grid">
            {photos.map(photo => {
              const source = resolveAttachmentPhoto(photo.photoId, photo.previewUrl, photoSources)
              return <div className="memo-photo-record" key={photo.id}>
                <div className="memo-photo-record-image">
                  {source ? <img src={source} alt={photo.tag || photo.name} /> : <div className="memo-photo-record-missing">相片已從相簿移除</div>}
                  <span
                    className="memo-photo-record-time"
                  >
                    {photo.time}
                  </span>
                </div>
                <div className="memo-photo-record-tag">{photo.tag}</div>
                {photo.customNote ? <div className="memo-photo-record-note">{photo.customNote}</div> : null}
              </div>
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

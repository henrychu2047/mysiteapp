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
        <header className={`memo-document-header ${letterhead ? 'memo-document-header-letterhead' : ''}`}>
          {!letterhead && <div className="memo-document-sender-name">{memo.sender.jvName}</div>}
          {!letterhead && <div className="memo-document-sender-contact">
            {memo.sender.address}
            <br />
            Tel: {memo.sender.tel}　Fax: {memo.sender.fax}　Email: {memo.sender.email}
          </div>}
        </header>

        <div className="memo-document-meta">
          <div className="memo-document-reference">
            <div><span>Date</span><strong>{memo.date}</strong></div>
            <div><span>Our Ref</span><strong>{memo.refNo}</strong></div>
          </div>
        </div>

        <div className="memo-document-recipient">
          <div className="memo-document-recipient-row">
            <div className="memo-document-recipient-address">
              <div className="memo-document-recipient-company">{memo.recipient.company}</div>
              {memo.recipient.addressLines.map((line, index) => (
                <div key={index} className="memo-document-recipient-line">
                  {line}
                </div>
              ))}
            </div>
            <div className="memo-document-delivery">{memo.delivery}</div>
          </div>
          <div className="memo-document-attention"><span>Attn:</span> {memo.recipient.attn}</div>
          <div className="memo-document-salutation">Dear Sir/Madam,</div>
          <div className="memo-document-project-details">
            <div>{memo.sender.contractNo}</div>
            <div>{memo.sender.projectTitle}</div>
            <div>{memo.sender.substationTitle}</div>
          </div>
        </div>

        <h2 className="memo-document-subject">{memo.subject}</h2>

        <div className="memo-document-body">{memo.roughInput}</div>

        {memo.legalClause.trim() && (
          <div className="memo-document-legal">{memo.legalClause}</div>
        )}

        <div className="memo-document-signature">
          <div>Yours faithfully,</div>
          <div className="memo-document-signature-company">{memo.sender.jvName}</div>
          <div className="memo-document-signature-image">
            {memo.signature ? (
              <img src={memo.signature || '/placeholder.svg'} alt="簽名" style={{ maxHeight: '45px' }} />
            ) : (
              <div className="memo-document-signature-line" />
            )}
          </div>
          <div className="memo-document-signature-footer">
            <div>
              <div className="memo-document-signer-name">{memo.sender.signerName}</div>
              <div className="memo-document-signer-role">{memo.sender.signerRole}</div>
            </div>
            <div className="memo-document-attachment-count">附件：{attachmentCount + (memo.photos.length ? 1 : 0)} 份</div>
          </div>
        </div>
      </section>

      {memo.pdfAttachments.flatMap((attachment, attachmentIndex) =>
        attachment.pages.map(page => (
          <section className="a4-portrait-page" key={`${attachment.id}-${page.pageNumber}`}>
            <div className="memo-attachment-page-heading">
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

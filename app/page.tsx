export default function Page() {
  return (
    <section className="content info-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ABOUT</p>
          <h2>資料</h2>
        </div>
      </div>

      <div className="about-block">
        <h3>關於此 App</h3>
        <p>
          這是一個為地盤工程而設的流動記錄工具，支援離線使用，所有相片與資料均保存在本機裝置。主要功能包括：拍照記錄（自動加上工程類別、樓層、機房等智能標籤並生成 Excel／PDF 報表）、Site Memo（一鍵生成 A4 公函並可 AI 行話潤色）及制房移交。
        </p>
      </div>

      <div className="about-block profile-block">
        <h3>開發及使用者資料</h3>
        <div className="profile-card">
          <div className="profile-avatar" aria-hidden="true">HC</div>
          <div className="profile-meta">
            <strong>Henry Chu</strong>
            <span>Project Manager</span>
            <span>Southa Technical Ltd</span>
            <a href="mailto:henrychu@southa.com">henrychu@southa.com</a>
          </div>
        </div>
      </div>
    </section>
  )
}

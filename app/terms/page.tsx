import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '服務條款｜地盤相片記錄系統',
  description: '地盤相片記錄系統的服務條款。',
}

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="legal-kicker">WORKSITE APP</p>
        <h1>服務條款</h1>
        <p className="legal-updated">最後更新：2026 年 9 月 7 日</p>
        <section><h2>使用本 App</h2><p>本 App 協助你記錄地盤相片、整理工程資料及匯出報表。你須確保所輸入、拍攝、匯出或備份的內容符合適用法律、工程合約及工作場所規則。</p></section>
        <section><h2>你的資料與備份</h2><p>你須自行負責保存、備份及核實資料。若連接 Google Drive，備份內容會儲存在你自己的 Google 帳戶；你可隨時停止備份或撤銷 Google 授權。</p></section>
        <section><h2>第三方服務</h2><p>Google Drive 與 AI 功能由第三方服務提供，並受其各自的條款及私隱政策約束。使用該等功能前，請確認你有權處理相關資料。</p></section>
        <section><h2>免責聲明</h2><p>本 App 按「現況」提供，並不取代專業工程、法律、安全或合約意見。使用者應自行覆核所有工程記錄、報表及 AI 產生內容。</p></section>
        <section><h2>聯絡我們</h2><p>如有問題，請聯絡 <a href="mailto:chuwing134538@gmail.com">chuwing134538@gmail.com</a>。</p></section>
      </article>
    </main>
  )
}

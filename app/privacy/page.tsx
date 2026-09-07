import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '私隱政策｜地盤相片記錄系統',
  description: '地盤相片記錄系統的私隱政策。',
}

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="legal-kicker">WORKSITE APP</p>
        <h1>私隱政策</h1>
        <p className="legal-updated">最後更新：2026 年 9 月 7 日</p>
        <section><h2>資料儲存</h2><p>地盤相片、工程標籤、備忘及報表資料預設只儲存在你使用的裝置瀏覽器內。你可隨時自行匯出或清除本機資料。</p></section>
        <section><h2>Google Drive 備份</h2><p>當你選擇「連接私人 Google Drive」時，Google 會直接在瀏覽器要求你登入並同意授權。授權只容許本 App 建立及管理它在你自己 Google Drive 內建立的備份檔案；本 App 不會讀取、列出或管理你原有的其他 Drive 檔案。</p><p>相片會由你的瀏覽器直接上傳到你選擇的 Google 帳戶。短期存取權杖只會暫存於目前的瀏覽器工作階段，不會傳送或保存於本 App 的伺服器。你可隨時在 Google 帳戶的第三方存取設定撤銷授權。</p></section>
        <section><h2>AI 功能</h2><p>如你主動使用 AI 潤飾或產生文字功能，相關輸入內容會傳送至所選的 AI 服務以完成請求。請勿提交不應交予該服務處理的機密或個人資料。</p></section>
        <section><h2>聯絡我們</h2><p>如對本政策或 Google Drive 備份有疑問，請聯絡 <a href="mailto:chuwing134538@gmail.com">chuwing134538@gmail.com</a>。</p></section>
      </article>
    </main>
  )
}

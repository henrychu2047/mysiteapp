# 地盤工程記錄 Web App

一個為地盤工程團隊設計的流動優先（mobile-first）Web App，用於記錄現場相片、Site Memo 及制房移交資料。系統支援離線工作，資料預設保存在使用者裝置內，適合工地網絡不穩定的環境。

## 主要功能

### 工程相片記錄
- 以相機或相簿加入相片。
- 按工程類別整理相片，並加入樓層、機房、房間名稱、事項、安全及收貨相關標籤。
- 支援自訂標籤選項及文字備註。
- 自動產生工程資訊浮水印。
- 相片列表支援查看、選取及批量匯出。
- 新相片以壓縮 JPEG/WebP Blob 及縮圖保存，減少 IndexedDB 容量；舊 Data URL 資料仍可兼容讀取。

### 報表匯出
- 匯出 Excel 報表。
- 以 A3 橫向格式即時生成 PDF 報表。
- PDF 頁面只在預覽及匯出時生成，不會長期保存暫存 PDF。
- 支援瀏覽器下載及流動裝置分享。

### Site Memo
- 建立及編輯現場 Site Memo。
- 內容按 Project 分開保存。
- 支援備註歷史、常用選項及文件預覽。
- 可透過 API 輔助潤飾 Memo 文字。

### 制房移交
- 按座（Tower）、樓層及機房分層管理。
- 支援未收、已收、已收（有 Defect）、拒絕簽收（有 Defect）及已完成狀態。
- 有 Defect 或自訂描述時，只能選擇兩種有 Defect 狀態。
- 支援 Defect、機房相片及操作歷史。
- 歷史包括狀態、日期、Defect、相片的新增／修改／刪除及前後內容。
- 批量產生資料會標準化名稱，避免大小寫、空格造成重複。

### Project 資料隔離
每個 Project 都有獨立的相片、Site Memo、制房移交資料、類別、標籤選項及設定備註。切換 Project 後只顯示目前工程資料。

### 完整備份及還原
「資料」頁可備份所有 Project、設定、相片、Site Memo、制房移交資料及操作歷史。匯入時會驗證 ZIP／JSON／版本、顯示摘要，並先建立目前資料的 recovery backup，確認後才還原。

### 保存狀態及儲存空間
- 顯示保存中、已保存、保存失敗及最後保存時間。
- IndexedDB 或 localStorage 寫入失敗時顯示提示。
- 未保存資料離開頁面前會提示。
- 顯示儲存空間使用量，接近上限時建議先備份。

### 離線及版本更新
- Service Worker 支援離線載入。
- HTML 採 Network First；Next.js 靜態資源採 Cache First。
- 每次部署更新 Cache 名稱並清理舊快取。
- 偵測到新版本時顯示提示；「資料」頁的「更新 App」會先備份，再更新快取及重新載入。

## 技術架構
- **Framework**：Next.js 16、React 19、TypeScript
- **樣式**：Tailwind CSS 及自訂 CSS
- **資料保存**：IndexedDB、localStorage、Blob URL
- **備份格式**：JSZip ZIP archive + JSON metadata
- **報表工具**：ExcelJS、jsPDF、html2canvas
- **部署**：Vercel 或其他支援 Next.js 的平台

## 專案結構
```text
app/
  page.tsx                 # 主頁、相片、Project、備份及導航
  layout.tsx               # Layout 及 metadata
  api/memo-polish/route.ts # Memo 文字潤飾 API
components/
  handover/                # 制房移交 UI、資料模型及 IndexedDB
  site-memo/               # Site Memo UI、文件及資料模型
public/
  sw.js                    # Service Worker 及快取策略
  manifest.webmanifest     # PWA manifest
```

## 本機開發
需要 Node.js 及 pnpm，建議依照專案 lockfile 安裝：
```bash
pnpm install
pnpm dev
```
開啟 <http://localhost:3000>。

## 建置及正式啟動
```bash
pnpm run build
pnpm start
```

連接 Vercel 後，按平台設定推送或合併至 `main` 自動部署。

## 使用注意事項
- 資料主要保存在瀏覽器本機，不會自動同步至雲端資料庫。
- 清除網站資料、無痕模式或瀏覽器自動清理，可能造成資料遺失。
- 建議定期到「資料」頁匯出完整 ZIP 備份。
- 大量相片或 PDF 生成時，請確保裝置有足夠記憶體及儲存空間。
- 備份 ZIP 包含工程相片及現場資料，請妥善保管。

## 相關連結
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev/)
- [Vercel Documentation](https://vercel.com/docs)

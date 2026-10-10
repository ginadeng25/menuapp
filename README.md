# 雙北高級日料菜單

手機優先的餐廳菜單瀏覽網站。第一個範圍：台北、新北的高級日本料理。可依「料理類型」「價位」「地區」篩選。

## 專案結構

```
public/
  index.html               網站本體（內嵌 CSS 與 JS，無框架）
  data/restaurants.json    店家資料（統一格式，前端與伺服端共用）
api/
  place.js                 /api/place?id=店家id  → 向 Google 查地點與照片清單
  photo.js                 /api/photo?name=...   → 轉址到 Google 照片暫時網址
  check.js                 /api/check            → 檢查金鑰是否可用
                           /api/check?list=1     → 列出每家店比對到的 Google 地點
  menus.js                 /api/menus?id=店家id  → 列出／上傳／刪除你的菜單照片
  menu-photo.js            /api/menu-photo?path= → 讀取私人儲存空間裡的照片
  _lib/google.js           共用呼叫邏輯與中文錯誤提示
  _lib/auth.js             網站密碼檢查
middleware.js              整站密碼鎖
test/api.test.js           伺服端函式測試（用假資料，不需金鑰）
```

部署在 Vercel：`public/` 是靜態網站，`api/` 會自動變成伺服端函式。

## Google 地圖照片

- 金鑰只放在 Vercel 的環境變數 `GOOGLE_PLACES_API_KEY`，**不寫進程式碼、不提交到版本庫**。
- 瀏覽器只呼叫我們自己的 `/api/...`，看不到金鑰。`/api/place` 只接受資料檔裡的店家 id，不能拿來查任意地點。
- 照片不下載、不存放：每次即時向 Google 取得暫時網址；只在瀏覽器快取 10 分鐘。
- 每張照片都標示拍攝者（連到其 Google 地圖頁面）與「Google 地圖」。
- Place ID 可以長期保存：確認比對正確後，寫進資料檔的 `placeId` 欄位，之後就直接用 ID 查詢，比較準也比較省。
- 封面優先順序：店家授權的 `img` → Google 地圖照片 → 直排店名（標示「照片待店家提供」）。
- 照片在卡片捲到畫面附近時才載入，減少 API 用量。

## 菜單照片上傳

- 目前不需密碼，任何人都能上傳、刪除（每家店最多 30 張、每張 4MB）。若設定 Vercel 環境變數 `UPLOAD_PASSWORD`，上傳與刪除就需要輸入密碼（同一台裝置輸入一次後會記住）。
- 照片存在 Vercel Blob（Private 類型），經由 `/api/menu-photo` 顯示。連接 Blob 後 Vercel 會自動加上 `BLOB_READ_WRITE_TOKEN`。
- 瀏覽器會先把照片縮到最長邊 2400px 的 JPG 再上傳（單張上限 4MB）。
- 整站密碼鎖（`middleware.js`）目前未啟用；之後若要只有自己能看，設定環境變數 `SITE_PASSWORD` 即可。

## 統一資料格式

| 欄位 | 說明 |
|---|---|
| id | 網址用的英文代號，不可重複 |
| name / type / city / area | 店名、料理類型、台北或新北、行政區 |
| award | 獎項，可空白 |
| img / menuImg | 店家授權的封面與菜單照片網址，可空白 |
| placeId | 已確認的 Google Place ID，可空白（空白時以店名＋地址自動比對） |
| plans | 套餐方案 `[{ n 名稱, p 每人價, p2 價格上限(可省略), note 備註 }]` |
| svc | 服務費說明 |
| addr / tel / hours | 地址、電話、營業時間 |
| src / date / url | 資料來源、日期、原文連結 |

價位級距以每人套餐價（新台幣、未含服務費）計：未滿 3,000／3,000–6,000（含兩端）／超過 6,000。有價格範圍（p～p2）的方案，只要範圍和級距有重疊就算符合。

## 測試

```
npm test
```

## 使用範圍

目前為個人使用：網站公開瀏覽，上傳不需密碼。若之後要對外開放，需重新決定上傳權限（公開、帳號或審核制），並處理照片授權。

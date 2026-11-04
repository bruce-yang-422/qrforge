![QRForge — QR Code（二維碼）與條碼工具](assets/brand/qrforge-banner-github.png)

# QRForge

[![Web App](https://img.shields.io/website?url=https%3A%2F%2Fqrforge.stack-base.com&label=web%20app)](https://qrforge.stack-base.com)
[![PWA: offline ready](https://img.shields.io/badge/PWA-offline%20ready-5A0FC8?logo=pwa&logoColor=white)](#網頁版)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Languages: 繁體中文 and English](https://img.shields.io/badge/languages-%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87%20%7C%20English-orange)](README.en.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**繁體中文** | [English](README.en.md)

產生、掃描與檢測 QR Code（二維碼），也能掃描條碼並製作可直接印刷的條碼。可在瀏覽器中使用;批次產生 QR Code 也可用命令列。

**[開啟網頁版](https://qrforge.stack-base.com)** · [回報問題](https://github.com/bruce-yang-422/qrforge/issues)

QRForge 提供兩種使用方式，兩者讀取相同的輸入格式：

- **網頁版：** 可安裝的 PWA，不需任何設定。檔案只在瀏覽器內處理，不會上傳。
- **命令列工具：** Python 腳本，一次轉換資料夾內的所有檔案。

網頁介面為繁體中文與英文雙語。

## 目錄

- [功能特色](#功能特色)
- [開始使用](#開始使用)
- [網頁版工具](#網頁版工具)
- [輸入格式](#輸入格式)
- [輸出檔名](#輸出檔名)
- [設定](#設定)
- [專案結構](#專案結構)
- [部署網頁版](#部署網頁版)
- [已知限制](#已知限制)
- [參與貢獻](#參與貢獻)
- [授權條款](#授權條款)

## 功能特色

- 可為網址、純文字、WiFi、電子名片（vCard）、Email、電話與簡訊產生 QR Code
- 支援讀取 CSV、Excel(`.xlsx`)與 TXT 檔案
- 自動判斷 TXT 檔的內容是網址或純文字
- 可輸出 PNG、JPG 或 SVG，並可調整容錯等級與縮放比例
- **網頁版：** 提供輸入時即時預覽、每批最多 500 張的批次產生、ZIP 與 PDF 下載、可加文字的標籤紙與離線使用
- **僅限網頁版：**
  - 自訂 QR Code 顏色與加入 Logo
  - QR Code 與條碼掃描，一張圖片可讀取多個 QR Code
  - QR Code 品質檢測與條碼產生器
  - 接收其他 App 分享的文字、連結與圖片
- **命令列工具：** 遞迴掃描輸入資料夾，每次執行都會產生帶時間戳記的記錄檔

## 開始使用

### 網頁版

開啟 <https://qrforge.stack-base.com>，在「QR Code」分頁輸入內容，QR Code 會立即出現，可直接下載。要一次產生多張，請用「批次」分頁，那裡也可以下載範本檔案。介面支援繁體中文與英文，可用右上角的按鈕切換。

如需離線使用，請先在連線狀態下開啟一次，等頁首顯示「可離線使用」即可。如需安裝，請使用「安裝」按鈕或瀏覽器選單的安裝功能;iPhone 和 iPad 請在 Safari 分享選單選擇「加入主畫面」。

### 命令列工具

需要 Python 3.10 以上版本。

```bash
git clone https://github.com/bruce-yang-422/qrforge.git
cd qrforge

python -m venv .venv
source .venv/bin/activate     # Windows:.venv\Scripts\activate

pip install -r requirements.txt
```

將來源檔案放入 `input/`，然後在專案根目錄執行：

```bash
python main.py
```

QR Code 會輸出至 `output/`，記錄檔則寫入 `logs/run_YYYYMMDD_HHMMSS.log`。

> [!WARNING]
> 每次執行都會刪除並重建記錄資料夾，只保留最新一份記錄檔，請勿在其中存放其他檔案。

## 網頁版工具

這些工具僅限網頁版。所有處理都在本機進行，圖片不會上傳。

| 分頁 | 功能 |
| --- | --- |
| **QR Code** | 從網址、文字、WiFi、電子名片、Email、電話或簡訊產生單張 QR Code，輸入時即時預覽。只輸入網域時會自動加上 `https://`，可在下方加上文字並選擇字型，也可將圖片傳到 LINE 或其他 App |
| **批次** | 從貼上的清單或 CSV、Excel、TXT 檔案產生最多 500 張，可輸出 PNG、JPG、SVG 或 PDF 並打包成 ZIP，也可排版成標籤紙 |
| **掃描** | 從相機、照片、SVG 檔或貼上的截圖讀取 QR Code 與條碼。一張圖片有多個 QR Code 時會全部讀取。相機可連續掃描，並在畫面下方即時顯示結果。掃到網址、Email、電話或簡訊時，會出現對應的開啟、寄信、撥打或傳簡訊按鈕，只有你點選後才會開啟 |
| **檢測** | 告訴你 QR Code 能否掃描及如何改善，並提供評等、對比、周圍留白與損傷模組圖。一張圖片有多個 QR Code 時，會逐一列出報告 |
| **條碼** | 以實際列印尺寸製作條碼，每次變更都會用另一套解碼器重新讀取驗證，也可分享或複製圖片 |

**電話、簡訊與電子名片：** 國碼可從選單選擇或手動輸入，預設為台灣 +886。電話號碼開頭的 0 會自動移除（義大利除外），並在欄位下方顯示實際的號碼。號碼以 `+` 開頭時會直接使用，不再加上國碼。

**電子名片的名字：** 姓與名分開填寫，也可以加上暱稱或英文名，例如 Tom。顯示名稱留空時會組成 `楊翔志 Tom`，也可以自行填寫。部分手機的通訊錄會改用姓與名顯示，暱稱則另外列出。

**QR Code 外觀：** 在「更多設定」可自訂圖案與背景顏色，並加入 PNG、JPG 或 WebP 的 Logo（5 MB 以內）。加入 Logo 時會自動使用最高容錯等級（H）。請選擇深色圖案配淺色背景，並在下載後實際掃描確認。

**掃描的條碼類型：** 不需切換模式，相機與圖片都能讀取 EAN、UPC、Code 128、Code 39、ITF、Data Matrix 等常見條碼，也能和 QR Code 一起讀取。每張圖片或每次相機讀取最多讀出一個條碼，結果會顯示條碼類型。

**接收分享：** 安裝 PWA 後，可在支援的系統分享選單選擇 QRForge。文字與連結會填入「QR Code」分頁，圖片則會開啟「掃描」分頁（最多 10 張，每張 20 MB 以內）。分享內容只暫存在裝置上，讀取後即刪除。是否出現在分享選單，取決於瀏覽器與作業系統。

**可製作的條碼類型：** EAN-13、EAN-8、UPC-A、UPC-E、ISBN、Code 128、ITF-14、GS1-128、SSCC-18 與 Data Matrix。校驗碼省略時會自動計算，填寫時會加以驗證。也可以在條碼下方加上文字並選擇字型，例如商品名稱。這段文字只會印出來，掃描時不會讀到。

**條碼下載：** 300、600 或 1200 dpi 的 PNG，以毫米為單位的 SVG、EPS、PDF，或整張標籤紙 PDF。

**標籤紙：** 「批次」分頁的標籤可加上各筆檔案名稱或自訂的共用文字，也會套用顏色與 Logo。請以 100% 比例列印，並先用一般紙張試印。

| 分類 | 型號 |
| --- | --- |
| 台灣常用 A4 | 鶴屋 C149210、C149105、C74105、C59105、C50105、L4567、L3867、C3770、C3070、L2138;龍德 LD-805、LD-836、LD-806 |
| 國際常用 A4 | Avery L7165、L7173、L7163、L7162、L7160、L7651 |
| 美規 Letter | Avery 5164、5163、5161、5160、5167 |

尺寸依鶴屋套印檔與公開的標籤紙規格設定，QRForge 與這些品牌沒有關聯。

> [!NOTE]
> 檢測的評等是依影像估算，並非 ISO/IEC 15415 或 15416 正式驗證。大量印刷前請先實際列印測試。

## 輸入格式

範本檔案：[CSV](assets/sample.csv) · [Excel](assets/sample.xlsx) · [TXT](assets/sample.txt)

### CSV 與 Excel

第一列為標題列，之後每一列產生一張 QR Code。欄位名稱必須與下表完全相同。Excel 檔案只會讀取第一個工作表（網頁版）或作用中工作表（命令列工具）。

| 欄位名稱 | 必填 | 說明 |
| --- | --- | --- |
| `類型` | 是 | `url`、`text`、`line`、`wifi`、`phone`、`sms`、`email` 或 `vcard` |
| `資料` | `url`、`text`、`line`、`email` 類型必填 | 要編碼的內容，會原樣寫入;`email` 類型為收件人 |
| `WiFi名稱` | `wifi` 類型必填 | 網路名稱(SSID) |
| `WiFi密碼` | `wifi` 類型必填 | 網路密碼;開放網路請留空 |
| `加密方式` | `wifi` 類型必填 | `WPA`、`WEP` 或 `nopass` |
| `國碼` | 否 | `phone`、`sms`、`vcard` 使用，例如 `+886`;留空時不加國碼 |
| `電話號碼` | `phone`、`sms` 類型必填 | 開頭的 0 會自動移除（義大利除外） |
| `主旨` | 否 | `email` 使用 |
| `內文` | 否 | `email`、`sms` 使用 |
| `姓`、`名` | `vcard` 類型至少填一欄 | 聯絡人的姓與名。舊檔案的 `姓名` 欄仍可使用 |
| `暱稱` | 否 | `vcard` 使用，例如英文名 Tom |
| `顯示名稱` | 否 | `vcard` 使用;留空時由姓名與暱稱組成，例如 `楊翔志 Tom` |
| `公司`、`職稱`、`Email`、`網站` | 否 | `vcard` 使用 |
| `Qr-code檔案名稱` | 否 | 輸出檔名，不含副檔名 |

沒有可編碼內容的資料列會被略過。無效的資料列會記錄錯誤，但不會中斷執行。範本檔案包含每種類型的範例。

```csv
類型,資料,WiFi名稱,WiFi密碼,加密方式,國碼,電話號碼,主旨,內文,姓,名,暱稱,顯示名稱,公司,職稱,Email,網站,Qr-code檔案名稱
url,https://example.com,,,,,,,,,,,,,,,,官網
wifi,,MySSID,MyPassword,WPA,,,,,,,,,,,,,辦公室WiFi
phone,,,,,+886,0912345678,,,,,,,,,,,客服電話
vcard,,,,,+886,0912345678,,,王,小明,Tom,,範例公司,業務經理,ming@example.com,https://example.com,王小明名片
```

欄位順序不限，用不到的欄位可以省略。舊檔案把 `phone`、`sms` 的號碼放在 `資料` 欄仍然可以使用。

### TXT

內容會先以逗號和換行分割，再依內容決定處理方式：

| 內容 | 判定結果 | 輸出 |
| --- | --- | --- |
| 單一網址 | 網址 | `{檔名}.png` |
| 多個網址 | 每個網址各一張 | `{檔名}_00001.png`、`{檔名}_00002.png`… |
| 其他內容，包含網址與文字混合 | 純文字 | `{檔名}.png`，將整個檔案編碼為一張 |

`{檔名}` 是來源檔案不含副檔名的名稱，副檔名則依輸出格式而定。網址必須以 `http://` 或 `https://` 開頭，且不可包含空白、中日韓文字或全形字元。

```text
https://example.com
https://github.com
```

## 輸出檔名

CSV 與 Excel 的資料列依下列順序決定檔名，採用第一個符合的項目：

1. `Qr-code檔案名稱` 欄位的值
2. 電子名片的顯示名稱
3. WiFi 名稱(SSID)
4. `{類型}_{序號}`，例如 `url_00001`

檔名中的不合法字元(`\ / : * ? " < > |`)會被移除。

在「QR Code」分頁中，檔名留空時預設為 `Qrcode_YYYYMMDD_HHMM_001`。

## 設定

命令列工具的設定位於 [`config/settings.py`](config/settings.py)。網頁版的格式在下載按鈕旁選擇，其他 QR Code 設定則在「更多設定」中調整。

| 設定項目 | 預設值 | 說明 |
| --- | --- | --- |
| `paths.input_dir` | `input` | 掃描來源檔案的資料夾 |
| `paths.output_dir` | `output` | 圖片輸出資料夾 |
| `paths.log_dir` | `logs` | 記錄檔資料夾，每次執行時清空 |
| `qr.error_correction` | `M` | `L`、`M`、`Q` 或 `H` |
| `qr.scale` | `8` | 每個 QR 模組的像素數 |
| `output.format` | `SVG` | `PNG`、`JPG` 或 `SVG`，須為大寫 |
| `csv.delimiter` | `,` | CSV 分隔符號;TSV 請使用 `"\t"` |

網頁版預設輸出 PNG，縮放比例可設為 2 到 20,CSV 一律以逗號分隔讀取。

容錯等級越高，可容許的損壞越多，但圖案也越密集：

| 等級 | 可復原比例 | 適用情境 |
| --- | --- | --- |
| `L` | 約 7% | 環境乾淨 |
| `M` | 約 15% | 一般用途 |
| `Q` | 約 25% | 可能有部分遮蔽或髒污 |
| `H` | 約 30% | 損壞風險高，例如貼紙或衣物 |

## 專案結構

```text
qrforge/
├── main.py                 # 命令列工具進入點
├── requirements.txt        # Python 相依套件
├── config/settings.py      # 命令列工具設定
├── input/                  # 命令列工具來源檔案(不納入 Git)
├── output/                 # 命令列工具輸出圖片(不納入 Git)
├── logs/                   # 命令列工具記錄檔(不納入 Git)
├── index.html              # 網頁版進入點
├── css/style.css           # 網頁版樣式
├── js/app.js               # QR Code 產生,main.py 的瀏覽器移植版
├── js/qr-extras.js         # 電子名片、Email、電話與簡訊內容,以及顏色、Logo 與繪製
├── js/i18n.js              # 介面語言
├── js/tabs.js              # 分頁切換與函式庫延遲載入
├── js/scanner.js           # 掃描與檢測分頁
├── js/qr-analyze.js        # 模組取樣、錯誤更正與評等
├── js/qr-multi.js          # 讀取同一張圖片中的多個 QR Code
├── js/barcode.js           # 條碼產生器介面
├── js/barcode-rules.js     # 條碼驗證與校驗碼
├── js/print.js             # PDF、EPS 與標籤紙輸出
├── js/share.js             # 分享與複製按鈕
├── js/share-target.js      # 接收其他 App 分享的內容
├── js/pwa.js               # 安裝提示與離線狀態
├── tests/                  # 瀏覽器功能檢查
├── sw.js                   # Service Worker
├── manifest.webmanifest    # PWA manifest
├── robots.txt              # 搜尋引擎爬取規則
├── sitemap.xml             # 提供給搜尋引擎的網址清單
├── libs/                   # 內附的瀏覽器函式庫
├── fonts/                  # 下方文字用的明體與楷體
└── assets/                 # 範本檔案、應用程式圖示、標誌與橫幅
```

## 部署網頁版

網頁版是靜態網站，不需要建置步驟。本機預覽方式：

```bash
python -m http.server 8000
```

然後開啟 <http://localhost:8000>。

部署時，請將 `index.html`、`manifest.webmanifest`、`sw.js`、`robots.txt`、`sitemap.xml`、`css/`、`js/`、`libs/`、`fonts/` 與 `assets/` 發布到任一靜態主機。應用程式的路徑皆為相對路徑，因此也支援 GitHub Pages 的 `/qrforge/` 這類子目錄。

`robots.txt`、`sitemap.xml` 與 `index.html` 的 SEO 標籤都寫死了 `https://qrforge.stack-base.com/`，部署到其他網域時請一併修改。搜尋引擎只會在網域根目錄讀取 `robots.txt`，放在子目錄不會生效。

離線功能需要 HTTPS 或 `localhost`。直接以 `file://` 開啟仍可使用網頁，但無法離線使用或安裝。詳情請參閱 MDN 的 [Service Worker API](https://developer.mozilla.org/zh-TW/docs/Web/API/Service_Worker_API)。

> [!IMPORTANT]
> 快取的檔案有變更時，請遞增 [`sw.js`](sw.js) 中的 `VERSION` 與 `index.html` 中對應的 `?v=`，否則已造訪過的使用者會繼續使用舊版。新版本會在關閉應用程式所有已開啟的視窗與分頁後生效;更新失敗時，舊版本仍可離線使用。

## 已知限制

- **命令列工具的檔名衝突：** 不論來源檔案位於哪個子資料夾，圖片都會直接輸出到 `output/`，同名檔案會被覆蓋。每個來源檔案的自動編號都會重新起算，因此不同檔案中未命名的資料列可能互相覆蓋。填寫檔名欄位即可避免。
- **含 BOM 的 CSV 檔（命令列工具）:** 含位元組順序標記的 UTF-8 檔案（例如 Excel 匯出的「CSV UTF-8」）會出現缺少欄位的錯誤。請改用不含 BOM 的檔案、`.xlsx` 檔或網頁版。
- **WiFi 加密方式預設值：** 網頁版會將空白的加密方式視為 `WPA`;命令列工具只有在整個欄位不存在時才會如此，因此使用命令列工具時請填寫此欄位。
- **網址中的逗號：** TXT 檔以逗號作為分隔符號，因此含逗號的網址會被拆開。請改用「批次」分頁的貼上清單或 CSV 檔。
- **分享：** 圖片在瀏覽器允許時為 PNG，否則為 JPG。「分享圖片」按鈕需要支援檔案分享的瀏覽器，並透過 HTTPS 或 `localhost` 開啟。不支援時按鈕會隱藏，可改用複製或下載。
- **LINE：** 網頁無法直接選擇對話或將圖片傳進 LINE。手機上請在分享選單選 LINE，電腦上圖片會先複製，再到對話中貼上。
- **掃描與檢測：** 內容相同的 QR Code 只會列出一次。相機每次只讀取一個 QR Code，要讀整張標籤紙請改用照片。小條碼的線條較細，用相機掃描時請靠近一點。「檢測」分頁只檢測 QR Code，不檢測條碼。
- **掃描結果的按鈕：** 「寄信」「撥打」「傳簡訊」需要裝置上有對應的 App，例如電腦沒有設定郵件程式時，「寄信」可能沒有反應。電子名片、WiFi 與條碼只提供複製。
- **多行 CSV 欄位（網頁版）:** 瀏覽器端的 CSV 解析器逐行讀取，不支援引號內含換行的欄位。

## 參與貢獻

歡迎提交 Issue 與 Pull Request。提交變更前請留意：

- `js/app.js`、`js/qr-extras.js` 與 `main.py` 的邏輯相互對應，修改輸入、內容格式或檔名規則時請同步更新。
- 網頁版的瀏覽器功能檢查位於 [`tests/`](tests/README.md)，執行方式請見該處說明。命令列工具目前沒有自動化測試，請使用[範本檔案](assets/)手動測試。
- 更新瀏覽器函式庫時，請依照 [`libs/README.md`](libs/README.md) 的步驟操作。

## 授權條款

本專案採用 [MIT 授權條款](LICENSE)。

命令列工具使用 [segno](https://github.com/heuer/segno)、[Pillow](https://python-pillow.org/) 與 [openpyxl](https://openpyxl.readthedocs.io/);網頁版使用 [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)、[SheetJS](https://sheetjs.com/)、[JSZip](https://stuk.github.io/jszip/)、[jsQR](https://github.com/cozmo/jsQR)、[bwip-js](https://github.com/metafloor/bwip-js) 與 [ZXing for JS](https://github.com/zxing-js/library)。瀏覽器函式庫的版本與授權檔案列於 [`libs/README.md`](libs/README.md)。

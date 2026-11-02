# QRForge

[English](README.md) | **繁體中文**

將 CSV、Excel、TXT 檔案批次轉換為 QR Code,可在瀏覽器或命令列中使用。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Last Commit](https://img.shields.io/github/last-commit/bruce-yang-422/qrforge)](https://github.com/bruce-yang-422/qrforge/commits/main)
[![Issues](https://img.shields.io/github/issues/bruce-yang-422/qrforge)](https://github.com/bruce-yang-422/qrforge/issues)

**[開啟網頁版](https://bruce-yang-422.github.io/qrforge)** · [回報問題](https://github.com/bruce-yang-422/qrforge/issues)

QRForge 提供兩種使用方式,兩者讀取相同的輸入格式:

- **網頁版:** 可安裝的 PWA,不需任何設定。檔案只在瀏覽器內處理,不會上傳。
- **命令列工具:** Python 腳本,一次轉換資料夾內的所有檔案。

網頁介面為繁體中文與英文雙語。

## 目錄

- [功能特色](#功能特色)
- [開始使用](#開始使用)
- [輸入格式](#輸入格式)
- [輸出檔名](#輸出檔名)
- [設定](#設定)
- [專案結構](#專案結構)
- [部署網頁版](#部署網頁版)
- [已知限制](#已知限制)
- [參與貢獻](#參與貢獻)
- [授權條款](#授權條款)

## 功能特色

- 可為網址、純文字與 WiFi 連線資訊產生 QR Code
- 支援讀取 CSV、Excel(`.xlsx`)與 TXT 檔案
- 自動判斷 TXT 檔的內容是網址或純文字
- 可輸出 PNG、JPG 或 SVG,並可調整容錯等級與縮放比例
- **網頁版:** 提供單筆快速產生表單、多檔拖放上傳、ZIP 下載與離線使用
- **命令列工具:** 遞迴掃描輸入資料夾,每次執行都會產生帶時間戳記的記錄檔

## 開始使用

### 網頁版

開啟 <https://bruce-yang-422.github.io/qrforge>,填寫「快速產生」表單,或將檔案拖放到上傳區。上傳區可下載範本檔案,輸出格式、縮放比例與容錯等級則在「進階選項」中調整。

如需離線使用,請先在連線狀態下開啟一次,等頁首顯示「已可離線使用」即可。如需安裝,請使用「安裝應用程式」按鈕或瀏覽器選單的安裝功能;iPhone 和 iPad 請在 Safari 分享選單選擇「加入主畫面」。

### 命令列工具

需要 Python 3.10 以上版本。

```bash
git clone https://github.com/bruce-yang-422/qrforge.git
cd qrforge

python -m venv .venv
source .venv/bin/activate     # Windows:.venv\Scripts\activate

pip install -r requirements.txt
```

將來源檔案放入 `input/`,然後在專案根目錄執行:

```bash
python main.py
```

QR Code 會輸出至 `output/`,記錄檔則寫入 `logs/run_YYYYMMDD_HHMMSS.log`。

> [!WARNING]
> 每次執行都會刪除並重建記錄資料夾,只保留最新一份記錄檔,請勿在其中存放其他檔案。

## 輸入格式

範本檔案:[CSV](assets/sample.csv) · [Excel](assets/sample.xlsx) · [TXT](assets/sample.txt)

### CSV 與 Excel

第一列為標題列,之後每一列產生一張 QR Code。欄位名稱必須與下表完全相同。Excel 檔案只會讀取第一個工作表(網頁版)或作用中工作表(命令列工具)。

| 欄位名稱 | 必填 | 說明 |
| --- | --- | --- |
| `類型` | 是 | `url`、`text`、`line` 或 `wifi` |
| `資料` | `url`、`text`、`line` 類型必填 | 要編碼的內容,會原樣寫入 |
| `WiFi名稱` | `wifi` 類型必填 | 網路名稱(SSID) |
| `WiFi密碼` | `wifi` 類型必填 | 網路密碼;開放網路請留空 |
| `加密方式` | `wifi` 類型必填 | `WPA`、`WEP` 或 `nopass` |
| `Qr-code檔案名稱` | 否 | 輸出檔名,不含副檔名 |

沒有可編碼內容的資料列會被略過。無效的資料列會記錄錯誤,但不會中斷執行。

```csv
類型,資料,WiFi名稱,WiFi密碼,加密方式,Qr-code檔案名稱
url,https://example.com,,,,官網
wifi,,MySSID,MyPassword,WPA,辦公室WiFi
text,Hello World,,,,
```

### TXT

內容會先以逗號和換行分割,再依內容決定處理方式:

| 內容 | 判定結果 | 輸出 |
| --- | --- | --- |
| 單一網址 | 網址 | `{檔名}.png` |
| 多個網址 | 每個網址各一張 | `{檔名}_00001.png`、`{檔名}_00002.png`… |
| 其他內容,包含網址與文字混合 | 純文字 | `{檔名}.png`,將整個檔案編碼為一張 |

`{檔名}` 是來源檔案不含副檔名的名稱。網址必須以 `http://` 或 `https://` 開頭,且不可包含空白、中日韓文字或全形字元。

```text
https://example.com
https://github.com
```

## 輸出檔名

CSV 與 Excel 的資料列依下列順序決定檔名,採用第一個符合的項目:

1. `Qr-code檔案名稱` 欄位的值
2. WiFi 名稱(SSID)
3. `{類型}_{序號}`,例如 `url_00001`

檔名中的不合法字元(`\ / : * ? " < > |`)會被移除。

在「快速產生」表單中,檔名留空時預設為 `Qrcode_YYYYMMDD_HHMM_001`。

## 設定

命令列工具的設定位於 [`config/settings.py`](config/settings.py)。網頁版的 QR Code 與輸出格式設定則在「進階選項」中調整。

| 設定項目 | 預設值 | 說明 |
| --- | --- | --- |
| `paths.input_dir` | `input` | 掃描來源檔案的資料夾 |
| `paths.output_dir` | `output` | 圖片輸出資料夾 |
| `paths.log_dir` | `logs` | 記錄檔資料夾,每次執行時清空 |
| `qr.error_correction` | `M` | `L`、`M`、`Q` 或 `H` |
| `qr.scale` | `8` | 每個 QR 模組的像素數 |
| `output.format` | `SVG` | `PNG`、`JPG` 或 `SVG`,須為大寫 |
| `csv.delimiter` | `,` | CSV 分隔符號;TSV 請使用 `"\t"` |

網頁版預設輸出 PNG,縮放比例可設為 2 到 20,CSV 一律以逗號分隔讀取。

容錯等級越高,可容許的損壞越多,但圖案也越密集:

| 等級 | 可復原比例 | 適用情境 |
| --- | --- | --- |
| `L` | 約 7% | 環境乾淨 |
| `M` | 約 15% | 一般用途 |
| `Q` | 約 25% | 可能有部分遮蔽或髒污 |
| `H` | 約 30% | 損壞風險高,例如貼紙或衣物 |

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
├── js/app.js               # main.py 邏輯的瀏覽器移植版
├── js/pwa.js               # 安裝提示與離線狀態
├── sw.js                   # Service Worker
├── manifest.webmanifest    # PWA manifest
├── libs/                   # 內附的瀏覽器函式庫
└── assets/                 # 範本檔案與應用程式圖示
```

## 部署網頁版

網頁版是靜態網站,不需要建置步驟。本機預覽方式:

```bash
python -m http.server 8000
```

然後開啟 <http://localhost:8000>。

部署時,請將 `index.html`、`manifest.webmanifest`、`sw.js`、`css/`、`js/`、`libs/` 與 `assets/` 發布到任一靜態主機。所有路徑皆為相對路徑,因此也支援 GitHub Pages 的 `/qrforge/` 這類子目錄。

離線功能需要 HTTPS 或 `localhost`。直接以 `file://` 開啟仍可使用網頁,但無法離線使用或安裝。詳情請參閱 MDN 的 [Service Worker API](https://developer.mozilla.org/zh-TW/docs/Web/API/Service_Worker_API)。

> [!IMPORTANT]
> 快取的檔案有變更時,請遞增 [`sw.js`](sw.js) 中的 `VERSION`,否則已造訪過的使用者會繼續使用舊版。新版本會在關閉應用程式所有已開啟的視窗與分頁後生效;更新失敗時,舊版本仍可離線使用。

## 已知限制

- **命令列工具的檔名衝突:** 不論來源檔案位於哪個子資料夾,圖片都會直接輸出到 `output/`,同名檔案會被覆蓋。每個來源檔案的自動編號都會重新起算,因此不同檔案中未命名的資料列可能互相覆蓋。填寫檔名欄位即可避免。
- **含 BOM 的 CSV 檔(命令列工具):** 含位元組順序標記的 UTF-8 檔案(例如 Excel 匯出的「CSV UTF-8」)會出現缺少欄位的錯誤。請改用不含 BOM 的檔案、`.xlsx` 檔或網頁版。
- **WiFi 加密方式預設值:** 網頁版會將空白的加密方式視為 `WPA`;命令列工具只有在整個欄位不存在時才會如此,因此使用命令列工具時請填寫此欄位。
- **WiFi 特殊字元:** SSID 或密碼中的 `;`、`,`、`:`、`\`、`"` 不會被跳脫,產生的 QR Code 可能無法連線。
- **網址中的逗號:** TXT 檔與「快速產生」的網址欄位都以逗號作為分隔符號,因此含逗號的網址會被拆開。
- **多行 CSV 欄位(網頁版):** 瀏覽器端的 CSV 解析器逐行讀取,不支援引號內含換行的欄位。

## 參與貢獻

歡迎提交 Issue 與 Pull Request。提交變更前請留意:

- `js/app.js` 與 `main.py` 的邏輯相互對應,修改輸入或檔名規則時請同步更新兩者。
- 專案目前沒有自動化測試,請使用[範本檔案](assets/)手動測試。
- 更新瀏覽器函式庫時,請依照 [`libs/README.md`](libs/README.md) 的步驟操作。

## 授權條款

本專案採用 [MIT 授權條款](LICENSE)。

命令列工具使用 [segno](https://github.com/heuer/segno)、[Pillow](https://python-pillow.org/) 與 [openpyxl](https://openpyxl.readthedocs.io/);網頁版使用 [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)、[SheetJS](https://sheetjs.com/) 與 [JSZip](https://stuk.github.io/jszip/)。瀏覽器函式庫的版本與授權檔案列於 [`libs/README.md`](libs/README.md)。

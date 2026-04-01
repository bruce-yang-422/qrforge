# QR Code Generator

## 多格式批次 QR Code 產生器

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/bruce-yang-422/qrforge/blob/main/LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Stars](https://img.shields.io/github/stars/bruce-yang-422/qrforge)](https://github.com/bruce-yang-422/qrforge)
[![Last Commit](https://img.shields.io/github/last-commit/bruce-yang-422/qrforge)](https://github.com/bruce-yang-422/qrforge/commits/main)
[![Issues](https://img.shields.io/github/issues/bruce-yang-422/qrforge)](https://github.com/bruce-yang-422/qrforge/issues)
![Status](https://img.shields.io/badge/status-active-success)


批次將 CSV、Excel、TXT 來源資料轉換為 QR code 圖片的命令列工具。支援網頁版線上使用。

Batch QR code generator — converts CSV, Excel, and TXT source files into QR code images via the command line. Also available as a web app.

**網頁版 / Web App** → [https://bruce-yang-422.github.io/qrforge](https://bruce-yang-422.github.io/qrforge)

---

## 功能特色 / Features

- 🌐 **網頁版**：免安裝，直接於瀏覽器使用，支援快速產生與批次上傳
- 支援 **CSV**、**Excel (.xlsx)**、**TXT** 三種輸入格式
- TXT 自動偵測純網址 / 純文本，支援單筆、逗號分隔、換行分隔多筆 URL
- 輸出格式：**PNG**、**JPG**、**SVG**（可於設定檔切換）
- QR 容錯等級與縮放比例可調
- 遞迴掃描 `input/` 資料夾下所有子目錄
- 每次執行自動產生帶時間戳的 log 檔，並清空舊紀錄

---

## 目錄結構 / Project Structure

```text
qr_code_generator/
├── config/
│   └── settings.py       # 設定檔 / Configuration
├── input/                # 放置來源檔案 / Input files go here
├── output/               # QR code 圖片輸出 / Generated QR images
├── logs/                 # 執行紀錄 / Run logs (auto-cleared each run)
├── main.py               # 主程式 / Entry point
└── README.md
```

---

## 安裝 / Installation

建議使用虛擬環境 / Recommended to use a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS / Linux

pip install segno pillow openpyxl
```

---

## 使用方式 / Usage

1. 將來源檔案放入 `input/` 資料夾
2. 依需求調整 `config/settings.py`
3. 執行主程式

```bash
python main.py
```

QR code 圖片會輸出至 `output/`，執行紀錄儲存於 `logs/run_YYYYMMDD_HHMMSS.log`。

---

## 範本檔案 / Sample Templates

| 格式 | 下載 |
| --- | --- |
| CSV | [assets/sample.csv](assets/sample.csv) |
| Excel | [assets/sample.xlsx](assets/sample.xlsx) |
| TXT | [assets/sample.txt](assets/sample.txt) |

---

## 輸入格式說明 / Input Formats

### CSV / Excel

第一列為標題列，欄位名稱如下：

| 欄位名稱 | 必填 | 說明 |
| --- | --- | --- |
| 類型 | ✅ | `url` / `text` / `line` / `wifi` |
| 資料 | | URL 或文字內容（url / text / line 類型使用） |
| WiFi名稱 | | WiFi SSID（wifi 類型使用） |
| WiFi密碼 | | WiFi 密碼（wifi 類型使用） |
| 加密方式 | | `WPA` / `WEP` / `nopass`，預設 `WPA` |
| Qr-code檔案名稱 | | 自訂輸出檔名（不含副檔名），留空則自動命名 |

範例 / Example:

```csv
類型,資料,WiFi名稱,WiFi密碼,加密方式,Qr-code檔案名稱
url,https://example.com,,,, 官網
wifi,,MySSID,MyPassword,WPA,辦公室WiFi
text,Hello World,,,,
```

### TXT

每個 `.txt` 檔案產生一張（或多張）QR code，檔名取自檔案名稱（不含副檔名）。

**自動判斷邏輯：**

| 內容格式 | 判定結果 | 輸出 |
| --- | --- | --- |
| 單一 URL | URL | `{檔名}.png` |
| 多筆 URL（逗號或換行分隔） | URL × N | `{檔名}_00001.png`、`{檔名}_00002.png`… |
| URL 夾雜中文或其他文字 | 純文本 | `{檔名}.png`（整個檔案當文字） |
| 非 URL 內容 | 純文本 | `{檔名}.png` |

範例 — 多筆 URL（逗號分隔）:

```text
https://example.com,https://github.com,https://google.com
```

範例 — 多筆 URL（換行分隔）:

```text
https://example.com
https://github.com
https://google.com
```

---

## 自動命名規則 / Auto Filename

未填寫 `Qr-code檔案名稱` 時，依下列優先順序決定檔名：

1. `Qr-code檔案名稱` 欄位值
2. WiFi SSID（wifi 類型）
3. `{類型}_{序號5碼}`，例如 `url_00001`、`wifi_00003`

---

## 設定檔 / Configuration

`config/settings.py`：

```python
CONFIG = {
    "paths": {
        "input_dir": "input",    # 來源資料夾
        "output_dir": "output",  # 輸出資料夾
        "log_dir": "logs",       # log 資料夾
    },
    "qr": {
        "error_correction": "M", # 容錯等級：L / M / Q / H
        "scale": 8,              # 每格放大倍數（px）
    },
    "output": {
        "format": "PNG",         # 輸出格式：PNG / JPG / SVG
    },
    "csv": {
        "delimiter": ",",        # CSV 分隔符號
    },
}
```

### 容錯等級 / Error Correction Levels

| 等級 | 容錯率 | 適用情境 |
| --- | --- | --- |
| L | 7% | 環境乾淨、QR 不易損壞 |
| M | 15% | 一般用途（預設） |
| Q | 25% | 可能有部分遮蔽或污損 |
| H | 30% | 高損壞風險，如印在衣物或貼紙上 |

---

## 相依套件 / Dependencies

| 套件 | 用途 |
| --- | --- |
| [segno](https://github.com/heuer/segno) | QR code 產生 |
| [Pillow](https://python-pillow.org/) | PNG / JPG 圖片輸出 |
| [openpyxl](https://openpyxl.readthedocs.io/) | Excel 檔案讀取 |

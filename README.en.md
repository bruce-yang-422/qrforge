<img src="assets/brand/qrforge-mark-on-white.png" alt="QRForge logo" width="180" />

# QRForge

[繁體中文](README.md) | **English**

Generate, scan, and test QR codes, and make print-ready barcodes. Runs in your browser or, for batch QR generation, from the command line.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Last Commit](https://img.shields.io/github/last-commit/bruce-yang-422/qrforge)](https://github.com/bruce-yang-422/qrforge/commits/main)
[![Issues](https://img.shields.io/github/issues/bruce-yang-422/qrforge)](https://github.com/bruce-yang-422/qrforge/issues)

**[Open the web app](https://bruce-yang-422.github.io/qrforge)** · [Report a bug](https://github.com/bruce-yang-422/qrforge/issues)

QRForge comes in two forms that read the same input formats:

- **Web app:** an installable PWA with no setup. Files are processed locally in the browser and are never uploaded.
- **Command-line tool:** a Python script that converts everything in a folder in one run.

The web interface is bilingual (Traditional Chinese and English).

## Contents

- [Features](#features)
- [Getting started](#getting-started)
- [Web app tools](#web-app-tools)
- [Input formats](#input-formats)
- [Output filenames](#output-filenames)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Deploying the web app](#deploying-the-web-app)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

## Features

- Generates QR codes for URLs, plain text, and WiFi credentials
- Reads CSV, Excel (`.xlsx`), and TXT files
- Detects whether a TXT file holds URLs or plain text
- Exports PNG, JPG, or SVG with adjustable error correction and scale
- **Web app:** live preview as you type, batches of up to 500 codes, ZIP and PDF download, label sheets, and offline use
- **Web app only:** QR scanner, QR quality check, and barcode generator
- **CLI:** recursive scan of the input folder and a timestamped log for each run

## Getting started

### Web app

Open <https://bruce-yang-422.github.io/qrforge>, then type in the **QR Code** tab and your QR code appears as you type, ready to download. To make many at once, use the **Batch** tab, where you can also download sample templates. The interface is in Traditional Chinese or English, and the button at the top right switches between them.

To use the app offline, open it once while connected and wait for the header to show **Works offline**. To install it, use the **Install** button or your browser's install menu. On iPhone and iPad, choose **Add to Home Screen** from the Safari share menu.

### Command line

Requires Python 3.10 or later.

```bash
git clone https://github.com/bruce-yang-422/qrforge.git
cd qrforge

python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

Put your source files in `input/`, then run the script from the repository root:

```bash
python main.py
```

QR codes are written to `output/`, and the log is written to `logs/run_YYYYMMDD_HHMMSS.log`.

> [!WARNING]
> The log directory is deleted and recreated on every run, so only the latest log is kept. Don't store other files there.

## Web app tools

These tools are in the web app only. Everything runs locally, and images are never uploaded.

| Tab | What it does |
| --- | --- |
| **QR Code** | Makes one code from a link, text, or WiFi details, with a live preview. Adds `https://` to a bare domain, can print text below the code, and can share the image or send to LINE |
| **Batch** | Makes up to 500 codes from a pasted list or CSV, Excel, and TXT files, as PNG, JPG, SVG, or PDF in a ZIP file. Also prints them on label sheets |
| **Scan** | Reads QR codes from the camera, a photo, or a pasted screenshot. Links only open when you click them |
| **Check** | Tells you whether a code will scan and how to improve it, with a grade, contrast, margin, and a map of damaged modules |
| **Barcode** | Makes barcodes at true print size, and re-reads each one with a separate decoder whenever you change it |

**Barcode types:** EAN-13, EAN-8, UPC-A, UPC-E, ISBN, Code 128, ITF-14, GS1-128, SSCC-18, and Data Matrix. Check digits are calculated if you leave them out, and verified if you include them. You can also add text below a barcode, such as a product name. It's printed only, and scanners won't read it.

**Barcode downloads:** PNG at 300, 600, or 1200 dpi, SVG, EPS, and PDF in millimetres, or a full label sheet as a PDF.

**Label sheets:** L7160, L7163, and L7165 (A4), and 5160 and 5163 (US Letter). These follow the published sheet dimensions, and QRForge isn't affiliated with Avery. Print at 100% scale and test on plain paper first.

> [!NOTE]
> Check grades are estimates from the image, not an ISO/IEC 15415 or 15416 verification. Test a printed sample before a large print run.

## Input formats

Sample files: [CSV](assets/sample.csv) · [Excel](assets/sample.xlsx) · [TXT](assets/sample.txt)

### CSV and Excel

The first row is the header, and each following row produces one QR code. Header names must match the Traditional Chinese names below exactly. Only the first worksheet (web) or the active worksheet (CLI) of an Excel file is read.

| Column | Required | Description |
| --- | --- | --- |
| `類型` (type) | Yes | `url`, `text`, `line`, or `wifi` |
| `資料` (data) | For `url`, `text`, `line` | Content to encode, used as is |
| `WiFi名稱` (SSID) | For `wifi` | Network name |
| `WiFi密碼` (password) | For `wifi` | Network password; leave empty for open networks |
| `加密方式` (security) | For `wifi` | `WPA`, `WEP`, or `nopass` |
| `Qr-code檔案名稱` (filename) | No | Output filename without extension |

Rows with no content to encode are skipped. An invalid row is logged and does not stop the run.

```csv
類型,資料,WiFi名稱,WiFi密碼,加密方式,Qr-code檔案名稱
url,https://example.com,,,,website
wifi,,MySSID,MyPassword,WPA,office-wifi
text,Hello World,,,,
```

### TXT

Content is split on commas and line breaks, then handled according to what it contains:

| Content | Treated as | Output |
| --- | --- | --- |
| One URL | URL | `{stem}.png` |
| Multiple URLs | One code per URL | `{stem}_00001.png`, `{stem}_00002.png`, … |
| Anything else, including a mix of URLs and text | Plain text | `{stem}.png`, encoding the whole file |

`{stem}` is the source filename without its extension. A URL must start with `http://` or `https://` and contain no whitespace, CJK, or full-width characters.

```text
https://example.com
https://github.com
```

## Output filenames

For CSV and Excel rows, the filename is the first of these that applies:

1. The `Qr-code檔案名稱` value
2. The WiFi SSID
3. `{type}_{number}`, such as `url_00001`

Characters that are illegal in filenames (`\ / : * ? " < > |`) are removed.

In the QR Code tab, an empty filename defaults to `Qrcode_YYYYMMDD_HHMM_001`.

## Configuration

The CLI reads its settings from [`config/settings.py`](config/settings.py). In the web app, the format is next to the download button, and the other QR settings are under **More settings**.

| Key | Default | Description |
| --- | --- | --- |
| `paths.input_dir` | `input` | Folder scanned for source files |
| `paths.output_dir` | `output` | Folder for generated images |
| `paths.log_dir` | `logs` | Folder for logs, cleared on each run |
| `qr.error_correction` | `M` | `L`, `M`, `Q`, or `H` |
| `qr.scale` | `8` | Pixels per QR module |
| `output.format` | `SVG` | `PNG`, `JPG`, or `SVG`, in uppercase |
| `csv.delimiter` | `,` | CSV field delimiter; use `"\t"` for TSV |

The web app defaults to PNG, accepts a scale of 2 to 20, and always reads CSV files as comma-delimited.

Higher error correction tolerates more damage but produces a denser code:

| Level | Recovery capacity | Typical use |
| --- | --- | --- |
| `L` | ~7% | Clean environments |
| `M` | ~15% | General use |
| `Q` | ~25% | Codes that may be partly obscured or dirty |
| `H` | ~30% | High risk of damage, such as stickers or clothing |

## Project structure

```text
qrforge/
├── main.py                 # CLI entry point
├── requirements.txt        # Python dependencies
├── config/settings.py      # CLI settings
├── input/                  # CLI source files (git-ignored)
├── output/                 # CLI generated images (git-ignored)
├── logs/                   # CLI run logs (git-ignored)
├── index.html              # Web app entry point
├── css/style.css           # Web app styles
├── js/app.js               # QR generation, a browser port of main.py
├── js/i18n.js              # Interface language
├── js/tabs.js              # Tab navigation and on-demand library loading
├── js/scanner.js           # Scan and Check tabs
├── js/qr-analyze.js        # Module sampling, error correction, and grading
├── js/barcode.js           # Barcode generator interface
├── js/barcode-rules.js     # Barcode validation and check digits
├── js/print.js             # PDF, EPS, and label sheet output
├── js/pwa.js               # Install prompt and offline status
├── sw.js                   # Service worker
├── manifest.webmanifest    # PWA manifest
├── libs/                   # Vendored browser libraries
└── assets/                 # Sample templates, app icons, and logo
```

## Deploying the web app

The web app is a static site with no build step. To preview it locally:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

To deploy, publish `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `libs/`, and `assets/` to any static host. All paths are relative, so subdirectories such as GitHub Pages' `/qrforge/` work.

Offline support requires HTTPS or `localhost`. The app still opens from `file://`, but without offline support or installation. See [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) on MDN for details.

> [!IMPORTANT]
> Bump `VERSION` in [`sw.js`](sw.js) whenever a cached file changes, or returning users will keep the old version. A new version takes effect after all open windows and tabs of the app are closed. If the update fails, the previous version stays available offline.

## Known limitations

- **CLI filename collisions:** all images go directly into `output/`, regardless of input subfolders, and existing files with the same name are overwritten. Automatic numbering restarts for each source file, so unnamed rows from different files can overwrite each other. Filling in the filename column avoids this.
- **CSV files with a BOM (CLI):** a UTF-8 file with a byte order mark, such as Excel's "CSV UTF-8" export, fails with a missing-column error. Use a file without a BOM, an `.xlsx` file, or the web app.
- **WiFi security default:** the web app treats an empty security value as `WPA`. The CLI only does so when the column is missing entirely, so fill it in for CLI input.
- **WiFi special characters:** `;`, `,`, `:`, `\`, and `"` in an SSID or password are not escaped, so the resulting code may not connect.
- **Commas in URLs:** TXT files treat commas as separators, so a URL containing one is split. Use the Batch tab's paste box or a CSV file instead.
- **Label sheets:** QR code labels from the Batch tab contain only the code, with no text below it.
- **Sharing:** the Share image button needs a browser that can share files, over HTTPS or `localhost`. Where it isn't available, it's hidden, and you can copy or download the image instead.
- **Scan and Check:** each image is read for one QR code, so only one result is returned when an image contains several.
- **Multi-line CSV fields (web):** the browser's CSV parser reads line by line, so quoted fields containing line breaks aren't supported.

## Contributing

Issues and pull requests are welcome. Before submitting a change, keep in mind:

- `js/app.js` mirrors the logic in `main.py`, so apply input and filename changes to both.
- There is no automated test suite yet, so test changes manually using the [sample files](assets/).
- To update a browser library, follow the steps in [`libs/README.md`](libs/README.md).

## License

Released under the [MIT License](LICENSE).

Built with [segno](https://github.com/heuer/segno), [Pillow](https://python-pillow.org/), and [openpyxl](https://openpyxl.readthedocs.io/) for the CLI, and [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), [SheetJS](https://sheetjs.com/), [JSZip](https://stuk.github.io/jszip/), [jsQR](https://github.com/cozmo/jsQR), [bwip-js](https://github.com/metafloor/bwip-js), and [ZXing for JS](https://github.com/zxing-js/library) for the web app. Versions and license files for the browser libraries are listed in [`libs/README.md`](libs/README.md).

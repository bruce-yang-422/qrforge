![QRForge: QR code and barcode tools](assets/brand/qrforge-banner-github.png)

# QRForge

[![Web App](https://img.shields.io/website?url=https%3A%2F%2Fqrforge.stack-base.com&label=web%20app)](https://qrforge.stack-base.com)
[![PWA: offline ready](https://img.shields.io/badge/PWA-offline%20ready-5A0FC8?logo=pwa&logoColor=white)](#web-app)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Languages: 繁體中文 and English](https://img.shields.io/badge/languages-%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87%20%7C%20English-orange)](README.en.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[繁體中文](README.md) | **English**

Generate, scan, and test QR codes, scan barcodes, and make print-ready ones. Runs in your browser or, for batch QR generation, from the command line.

**[Open the web app](https://qrforge.stack-base.com)** · [Report a bug](https://github.com/bruce-yang-422/qrforge/issues)

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

- Generates QR codes for URLs, plain text, WiFi credentials, vCard contacts, email, phone numbers, and SMS
- Reads CSV, Excel (`.xlsx`), and TXT files
- Detects whether a TXT file holds URLs or plain text
- Exports PNG, JPG, or SVG with adjustable error correction and scale
- **Web app:** live preview as you type, batches of up to 500 codes, ZIP and PDF download, label sheets with optional text, and offline use
- **Web app only:**
  - Custom QR code colors and logos
  - QR code and barcode scanning, with several QR codes read from one image
  - QR quality check and barcode generator
  - Receiving text, links, and images shared from other apps
- **CLI:** recursive scan of the input folder and a timestamped log for each run

## Getting started

### Web app

Open <https://qrforge.stack-base.com>, then type in the **QR Code** tab and your QR code appears as you type, ready to download. To make many at once, use the **Batch** tab, where you can also download sample templates. The interface is in Traditional Chinese or English, and the button at the top right switches between them.

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
| **QR Code** | Makes one code from a link, text, WiFi details, a contact, an email, a phone number, or an SMS, with a live preview. Adds `https://` to a bare domain, can print text below the code in a choice of fonts, and can share or copy the image |
| **Batch** | Makes up to 500 codes from a pasted list or CSV, Excel, and TXT files, as PNG, JPG, SVG, or PDF in a ZIP file. Also prints them on label sheets |
| **Scan** | Reads QR codes and barcodes from the camera, a photo, an SVG file, or a pasted screenshot. An image with several codes has all of them read. The camera keeps scanning and shows results live below the picture. Links, email, phone numbers, and SMS get a matching open, send email, call, or send text button, and only open when you click it |
| **Check** | Tells you whether a code will scan and how to improve it, with a grade, contrast, margin, and a map of damaged modules. An image with several codes gets a report for each |
| **Barcode** | Makes barcodes at true print size, and re-reads each one with a separate decoder whenever you change it. Can also share or copy the image |

**Phone, SMS, and contacts:** choose the country code from the menu or type it in. It starts as Taiwan, +886. A leading 0 in the phone number is removed (except for Italy), and the real number is shown below the field. A number that starts with `+` is used as is, without the country code.

**Contact names:** enter the family and given names separately, and optionally a nickname or English name, such as Tom. An empty display name becomes `楊翔志 Tom`, or you can write your own. Some phones' contact apps show the family and given names instead, and list the nickname separately.

**QR code appearance:** under **More settings**, choose the code and background colors, and add a PNG, JPG, or WebP logo under 5 MB. A logo automatically uses the highest error correction (H). Use dark modules on a light background, and test the downloaded code by scanning it.

**Barcodes it can scan:** with no mode to switch, the camera and images read common types including EAN, UPC, Code 128, Code 39, ITF, and Data Matrix, alongside QR codes. Each image or camera read gives at most one barcode, and the result shows its type.

**Receiving shares:** after installing the PWA, choose QRForge in a supported system share sheet. Text and links fill in the QR Code tab, and images open the Scan tab (up to 10 images, each under 20 MB). Shares are stored only on the device and deleted once read. Whether QRForge appears in the share sheet depends on the browser and operating system.

**Barcodes it can make:** EAN-13, EAN-8, UPC-A, UPC-E, ISBN, Code 128, ITF-14, GS1-128, SSCC-18, and Data Matrix. Check digits are calculated if you leave them out, and verified if you include them. You can also add text below a barcode, such as a product name, and choose its font. It's printed only, and scanners won't read it.

**Barcode downloads:** PNG at 300, 600, or 1200 dpi, SVG, EPS, and PDF in millimetres, or a full label sheet as a PDF.

**Label sheets:** labels from the Batch tab can show each file name or shared custom text, and keep the colors and logo. Print at 100% scale and test on plain paper first.

| Group | Models |
| --- | --- |
| Common in Taiwan, A4 | Herwood C149210, C149105, C74105, C59105, C50105, L4567, L3867, C3770, C3070, and L2138; Longder LD-805, LD-836, and LD-806 |
| International, A4 | Avery L7165, L7173, L7163, L7162, L7160, and L7651 |
| US Letter | Avery 5164, 5163, 5161, 5160, and 5167 |

These follow Herwood's templates and published sheet dimensions, and QRForge isn't affiliated with these brands.

> [!NOTE]
> Check grades are estimates from the image, not an ISO/IEC 15415 or 15416 verification. Test a printed sample before a large print run.

## Input formats

Sample files: [CSV](assets/sample.csv) · [Excel](assets/sample.xlsx) · [TXT](assets/sample.txt)

### CSV and Excel

The first row is the header, and each following row produces one QR code. Header names must match the Traditional Chinese names below exactly. Only the first worksheet (web) or the active worksheet (CLI) of an Excel file is read.

| Column | Required | Description |
| --- | --- | --- |
| `類型` (type) | Yes | `url`, `text`, `line`, `wifi`, `phone`, `sms`, `email`, or `vcard` |
| `資料` (data) | For `url`, `text`, `line`, `email` | Content to encode, used as is; the recipient for `email` |
| `WiFi名稱` (SSID) | For `wifi` | Network name |
| `WiFi密碼` (password) | For `wifi` | Network password; leave empty for open networks |
| `加密方式` (security) | For `wifi` | `WPA`, `WEP`, or `nopass` |
| `國碼` (country code) | No | For `phone`, `sms`, `vcard`, such as `+886`; if empty, no code is added |
| `電話號碼` (phone number) | For `phone`, `sms` | A leading 0 is removed, except for Italy |
| `主旨` (subject) | No | For `email` |
| `內文` (body) | No | For `email`, `sms` |
| `姓`, `名` (family name, given name) | At least one for `vcard` | Contact's name. Older files' `姓名` column still works |
| `暱稱` (nickname) | No | For `vcard`, such as an English name like Tom |
| `顯示名稱` (display name) | No | For `vcard`; if empty, it's built from the name and nickname, such as `楊翔志 Tom` |
| `公司`, `職稱`, `Email`, `網站` (organization, job title, email, website) | No | For `vcard` |
| `Qr-code檔案名稱` (filename) | No | Output filename without extension |

Rows with no content to encode are skipped. An invalid row is logged and does not stop the run. The sample files include an example of each type.

```csv
類型,資料,WiFi名稱,WiFi密碼,加密方式,國碼,電話號碼,主旨,內文,姓,名,暱稱,顯示名稱,公司,職稱,Email,網站,Qr-code檔案名稱
url,https://example.com,,,,,,,,,,,,,,,,website
wifi,,MySSID,MyPassword,WPA,,,,,,,,,,,,,office-wifi
phone,,,,,+886,0912345678,,,,,,,,,,,support-line
vcard,,,,,+886,0912345678,,,Wang,Ming,Tom,,Example Inc,Sales Manager,ming@example.com,https://example.com,ming-card
```

Columns can be in any order, and unused ones can be left out. Older files that keep a `phone` or `sms` number in `資料` still work.

### TXT

Content is split on commas and line breaks, then handled according to what it contains:

| Content | Treated as | Output |
| --- | --- | --- |
| One URL | URL | `{stem}.png` |
| Multiple URLs | One code per URL | `{stem}_00001.png`, `{stem}_00002.png`, … |
| Anything else, including a mix of URLs and text | Plain text | `{stem}.png`, encoding the whole file |

`{stem}` is the source filename without its extension, and the output's extension follows the output format. A URL must start with `http://` or `https://` and contain no whitespace, CJK, or full-width characters.

```text
https://example.com
https://github.com
```

## Output filenames

For CSV and Excel rows, the filename is the first of these that applies:

1. The `Qr-code檔案名稱` value
2. A contact's display name
3. The WiFi SSID
4. `{type}_{number}`, such as `url_00001`

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
├── js/qr-extras.js         # vCard, email, phone, and SMS content, plus colors, logos, and drawing
├── js/i18n.js              # Interface language
├── js/tabs.js              # Tab navigation and on-demand library loading
├── js/scanner.js           # Scan and Check tabs
├── js/qr-analyze.js        # Module sampling, error correction, and grading
├── js/qr-multi.js          # Reads several QR codes from one image
├── js/barcode.js           # Barcode generator interface
├── js/barcode-rules.js     # Barcode validation and check digits
├── js/print.js             # PDF, EPS, and label sheet output
├── js/share.js             # Share and copy buttons
├── js/share-target.js      # Receives content shared from other apps
├── js/pwa.js               # Install prompt and offline status
├── tests/                  # Browser feature checks
├── sw.js                   # Service worker
├── manifest.webmanifest    # PWA manifest
├── robots.txt              # Crawling rules for search engines
├── sitemap.xml             # Site address list for search engines
├── libs/                   # Vendored browser libraries
├── fonts/                  # Serif and regular-script fonts for text below codes
└── assets/                 # Sample templates, app icons, logo, and banners
```

## Deploying the web app

The web app is a static site with no build step. To preview it locally:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

To deploy, publish `index.html`, `manifest.webmanifest`, `sw.js`, `robots.txt`, `sitemap.xml`, `css/`, `js/`, `libs/`, `fonts/`, and `assets/` to any static host. The app's paths are all relative, so subdirectories such as GitHub Pages' `/qrforge/` work.

`robots.txt`, `sitemap.xml`, and the SEO tags in `index.html` name `https://qrforge.stack-base.com/` directly, so change them if you deploy to another domain. Search engines only read `robots.txt` from the root of a domain, so it has no effect in a subdirectory.

Offline support requires HTTPS or `localhost`. The app still opens from `file://`, but without offline support or installation. See [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) on MDN for details.

> [!IMPORTANT]
> Bump `VERSION` in [`sw.js`](sw.js) and the matching `?v=` in `index.html` whenever a cached file changes, or returning users will keep the old version. A new version takes effect after all open windows and tabs of the app are closed. If the update fails, the previous version stays available offline.

## Known limitations

- **CLI filename collisions:** all images go directly into `output/`, regardless of input subfolders, and existing files with the same name are overwritten. Automatic numbering restarts for each source file, so unnamed rows from different files can overwrite each other. Filling in the filename column avoids this.
- **CSV files with a BOM (CLI):** a UTF-8 file with a byte order mark, such as Excel's "CSV UTF-8" export, fails with a missing-column error. Use a file without a BOM, an `.xlsx` file, or the web app.
- **WiFi security default:** the web app treats an empty security value as `WPA`. The CLI only does so when the column is missing entirely, so fill it in for CLI input.
- **Commas in URLs:** TXT files treat commas as separators, so a URL containing one is split. Use the Batch tab's paste box or a CSV file instead.
- **Sharing:** images are PNG where the browser allows it, otherwise JPG. The Share image button needs a browser that can share files, over HTTPS or `localhost`. Where it isn't available, it's hidden, and you can copy or download the image instead.
- **LINE:** a web page can't pick a chat or send an image straight into LINE. On a phone, choose LINE in the share menu. On a computer, the image is copied first, so paste it into the chat.
- **Scan and Check:** codes with identical content are listed once. The camera reads one code at a time, so use a photo to read a whole label sheet. Small barcodes have thin lines, so hold the camera closer. The Check tab checks QR codes only, not barcodes.
- **Scan result buttons:** Send email, Call, and Send text need a matching app on the device. For example, Send email may do nothing on a computer with no email program set up. Contacts, WiFi, and barcodes can only be copied.
- **Multi-line CSV fields (web):** the browser's CSV parser reads line by line, so quoted fields containing line breaks aren't supported.

## Contributing

Issues and pull requests are welcome. Before submitting a change, keep in mind:

- `js/app.js` and `js/qr-extras.js` mirror the logic in `main.py`, so apply input, content format, and filename changes to all of them.
- Browser feature checks for the web app are in [`tests/`](tests/README.md), which explains how to run them. The CLI has no automated tests yet, so test its changes manually using the [sample files](assets/).
- To update a browser library, follow the steps in [`libs/README.md`](libs/README.md).

## License

Released under the [MIT License](LICENSE).

Built with [segno](https://github.com/heuer/segno), [Pillow](https://python-pillow.org/), and [openpyxl](https://openpyxl.readthedocs.io/) for the CLI, and [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), [SheetJS](https://sheetjs.com/), [JSZip](https://stuk.github.io/jszip/), [jsQR](https://github.com/cozmo/jsQR), [bwip-js](https://github.com/metafloor/bwip-js), and [ZXing for JS](https://github.com/zxing-js/library) for the web app. Versions and license files for the browser libraries are listed in [`libs/README.md`](libs/README.md).

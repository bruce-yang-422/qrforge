# Browser dependencies

These pinned distributions are committed so QRForge works without a CDN, including offline.

| Library | Version | Source | License file |
| --- | --- | --- | --- |
| qrcode-generator | 1.4.4 | https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js | LICENSE.qrcode-generator |
| SheetJS CE | 0.20.3 | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js | LICENSE.sheetjs |
| JSZip | 3.10.1 | https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js | LICENSE.jszip |

When updating a library, replace its distribution and license, then bump `VERSION` in `sw.js`.

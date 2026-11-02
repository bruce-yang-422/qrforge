# Browser dependencies

These pinned distributions are committed so QRForge works without a CDN, including offline.

| Library | Version | Source | License file |
| --- | --- | --- | --- |
| qrcode-generator | 1.4.4 | https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js | LICENSE.qrcode-generator |
| SheetJS CE | 0.20.3 | https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js | LICENSE.sheetjs |
| JSZip | 3.10.1 | https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js | LICENSE.jszip |
| jsQR | 1.4.0 | https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz (`dist/jsQR.js`) | LICENSE.jsqr |
| bwip-js | 4.11.4 | https://registry.npmjs.org/bwip-js/-/bwip-js-4.11.4.tgz (`dist/bwip-js-min.js`) | LICENSE.bwip-js |
| ZXing for JS | 0.21.3 | https://registry.npmjs.org/@zxing/library/-/library-0.21.3.tgz (`umd/index.min.js`) | LICENSE.zxing |

When updating a library, replace its distribution and license, then bump `VERSION` in `sw.js`.

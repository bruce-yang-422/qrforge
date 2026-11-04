# Browser feature checks

The checks use Playwright with an installed Google Chrome. Start a local server from the repository root with `python -m http.server 8765 --bind 127.0.0.1`, then run `node tests/browser-features.cjs` with `playwright` available on Node's module search path.

For an isolated PowerShell setup:

```powershell
npm install --prefix "$env:TEMP/qrforge-validation" playwright --no-save --package-lock=false
$env:NODE_PATH = "$env:TEMP/qrforge-validation/node_modules"
node tests/browser-features.cjs
```

These checks decode the generated vCard, email, phone and SMS payloads; verify colored QR codes and logos, SVG captions and PDF exports; scan Code 128, EAN-13, Code 39 and Data Matrix images; receive incoming text, links and an image through the service worker; and exercise offline reception and the mobile label menu. Physical camera capture and the operating system's native share sheet need a device check.

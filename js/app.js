// @ts-nocheck
/* ===================================================================
   QR Code Batch Generator — browser port of main.py
   QRCode / XLSX / JSZip are loaded via CDN before this script.
   =================================================================== */

/* ── Column map (mirrors Python COLUMN_MAP) ──────────────────────── */
const COLUMN_MAP = {
  "類型":          "type",
  "資料":          "data",
  "WiFi名稱":      "ssid",
  "WiFi密碼":      "password",
  "加密方式":      "security",
  "Qr-code檔案名稱": "name",
};

/* ── Helpers ─────────────────────────────────────────────────────── */
const _URL_RE      = /^https?:\/\/[^\s]+$/;
const _NON_URL_RE  = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uff00-\uffef]/;
const _ILLEGAL_RE  = /[\\/:*?"<>|]/g;

function sanitizeFilename(name) {
  return String(name).replace(_ILLEGAL_RE, "");
}

function isUrl(token) {
  const t = token.trim();
  return _URL_RE.test(t) && !_NON_URL_RE.test(t);
}

function splitTokens(content) {
  const tokens = [];
  for (const line of content.split(/\r?\n/)) {
    for (const part of line.split(",")) {
      const t = part.trim();
      if (t) tokens.push(t);
    }
  }
  return tokens;
}

/* ── Logging ─────────────────────────────────────────────────────── */
const logArea = document.getElementById("log-area");

function log(msg, cls = "log-info") {
  logArea.classList.add("visible");
  const line = document.createElement("div");
  line.className = cls;
  line.textContent = msg;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}
function logOk(msg)   { log("✓ " + msg, "log-ok"); }
function logErr(msg)  { log("✗ " + msg, "log-err"); }
function logInfo(msg) { log("ℹ " + msg, "log-info"); }
function logWarn(msg) { log("⚠ " + msg, "log-warn"); }

function clearLog() {
  logArea.innerHTML = "";
  logArea.classList.remove("visible");
}

/* ── Spinner ─────────────────────────────────────────────────────── */
const spinner    = document.getElementById("spinner");
const spinnerMsg = document.getElementById("spinner-msg");

function showSpinner(msg = "處理中 Processing…") {
  spinnerMsg.textContent = msg;
  spinner.classList.add("visible");
}
function hideSpinner() {
  spinner.classList.remove("visible");
}

/* ── Read advanced settings from UI ──────────────────────────────── */
function getSettings() {
  return {
    ecl:    document.getElementById("opt-ecl").value,
    scale:  Math.max(2, parseInt(document.getElementById("opt-scale").value, 10) || 8),
    format: document.querySelector("input[name='opt-fmt']:checked").value,
  };
}

/* ── QR generation — returns { format, canvas?, svg? } ───────────── */
// Uses qrcode-generator (global: `qrcode` lowercase function).
function makeQr(data) {
  const { ecl, scale, format } = getSettings();

  // typeNumber 0 = auto-detect; 'Byte' mode handles UTF-8 / CJK characters.
  const qr = qrcode(0, ecl);
  qr.addData(data, "Byte");
  qr.make();

  if (format === "SVG") {
    const svgStr = qr.createSvgTag(scale, 4);
    return { format: "SVG", svg: svgStr };
  }

  // Render onto an off-screen canvas (PNG / JPG).
  const modules = qr.getModuleCount();
  const margin  = 4 * scale;
  const size    = modules * scale + margin * 2;
  const canvas  = document.createElement("canvas");
  canvas.width  = canvas.height = size;
  const ctx     = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(c * scale + margin, r * scale + margin, scale, scale);
      }
    }
  }

  return { format, canvas };
}

/* ── Results state ───────────────────────────────────────────────── */
// Each entry: { filename: string, qr: { format, canvas?, svg? } }
const results = [];

function clearResults() {
  results.length = 0;
  document.getElementById("results-grid").innerHTML = "";
  document.getElementById("toolbar").classList.remove("visible");
}

const DL_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>`;

function renderCard(filename, qr) {
  const grid = document.getElementById("results-grid");
  const ext  = qr.format.toLowerCase();

  const card = document.createElement("div");
  card.className = "qr-card";

  const wrap = document.createElement("div");
  wrap.className = "qr-canvas-wrap";

  if (qr.format === "SVG") {
    const img = document.createElement("img");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr.svg);
    img.alt = filename;
    wrap.appendChild(img);
  } else {
    const display = document.createElement("canvas");
    display.width  = qr.canvas.width;
    display.height = qr.canvas.height;
    display.getContext("2d").drawImage(qr.canvas, 0, 0);
    wrap.appendChild(display);
  }

  const label = document.createElement("div");
  label.className = "qr-filename";
  label.textContent = `${filename}.${ext}`;

  const dlBtn = document.createElement("button");
  dlBtn.className = "btn btn-secondary btn-sm";
  dlBtn.innerHTML = `${DL_ICON} 下載`;
  dlBtn.addEventListener("click", () => downloadSingle(filename, qr));

  card.appendChild(wrap);
  card.appendChild(label);
  card.appendChild(dlBtn);
  grid.appendChild(card);
}

function updateToolbar() {
  const toolbar    = document.getElementById("toolbar");
  const countLabel = document.getElementById("count-label");
  const zipBtn     = document.getElementById("zip-btn");
  const dlBtn      = document.getElementById("single-dl-btn");

  if (results.length === 0) {
    toolbar.classList.remove("visible");
  } else if (results.length === 1) {
    // Single result: show direct download button, hide ZIP
    toolbar.classList.add("visible");
    countLabel.textContent = "共產生 1 張 QR Code / 1 QR code generated";
    zipBtn.style.display = "none";
    dlBtn.style.display  = "";
  } else {
    // Multiple results: show ZIP button, hide single download
    toolbar.classList.add("visible");
    countLabel.textContent = `共產生 ${results.length} 張 QR Code / ${results.length} QR codes generated`;
    zipBtn.style.display = "";
    dlBtn.style.display  = "none";
  }
}

/* ── Add a single generated QR to the UI ─────────────────────────── */
async function addResult(filename, data) {
  const qr = makeQr(data);
  results.push({ filename, qr });
  renderCard(filename, qr);
  updateToolbar();
}

/* ── Download helpers ────────────────────────────────────────────── */
function downloadSingle(filename, qr) {
  const a   = document.createElement("a");
  const ext = qr.format.toLowerCase();

  if (qr.format === "SVG") {
    const blob = new Blob([qr.svg], { type: "image/svg+xml;charset=utf-8" });
    a.href     = URL.createObjectURL(blob);
    a.download = `${filename}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else {
    const mime = qr.format === "JPG" ? "image/jpeg" : "image/png";
    a.href     = qr.canvas.toDataURL(mime, 0.92);
    a.download = `${filename}.${ext}`;
    a.click();
  }
}

const ZIP_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>`;

document.getElementById("zip-btn").addEventListener("click", async () => {
  if (results.length === 0) return;
  const zipBtn = document.getElementById("zip-btn");
  zipBtn.disabled = true;
  zipBtn.textContent = "打包中…";

  const zip = new JSZip();
  for (const { filename, qr } of results) {
    const ext = qr.format.toLowerCase();
    if (qr.format === "SVG") {
      zip.file(`${filename}.svg`, qr.svg);
    } else {
      const mime   = qr.format === "JPG" ? "image/jpeg" : "image/png";
      const base64 = qr.canvas.toDataURL(mime, 0.92).split(",")[1];
      zip.file(`${filename}.${ext}`, base64, { base64: true });
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "qrcodes.zip";
  a.click();
  URL.revokeObjectURL(url);

  zipBtn.disabled = false;
  zipBtn.innerHTML = `${ZIP_ICON} 全部下載 (ZIP)`;
});

/* ── Business logic ──────────────────────────────────────────────── */

function normalizeRow(rawRow) {
  const row = {};
  for (const [k, v] of Object.entries(rawRow)) {
    const key = COLUMN_MAP[k] ?? k;
    row[key]  = (typeof v === "string") ? v.trim() : (v ?? "");
  }
  return row;
}

function formatQrData(row) {
  const t = (row.type || "").toLowerCase();
  if (["url", "text", "line"].includes(t)) return row.data || "";
  if (t === "wifi") {
    const security = row.security || "WPA";
    return `WIFI:T:${security};S:${row.ssid || ""};P:${row.password || ""};;`;
  }
  throw new Error(`不支援類型 / Unsupported type: "${row.type}"`);
}

function generateFilename(row, index) {
  const name = row.name || row.ssid;
  if (name) return sanitizeFilename(name);
  const t = (row.type || "data").toLowerCase();
  return `${t}_${String(index).padStart(5, "0")}`;
}

/* ── TXT processing ──────────────────────────────────────────────── */
async function processTxt(content, stem) {
  const trimmed = content.trim();
  if (!trimmed) { logWarn(`${stem}.txt — 檔案為空 / empty file`); return; }

  const tokens = splitTokens(trimmed);
  const flags  = tokens.map(isUrl);

  if (tokens.length > 0 && flags.every(Boolean)) {
    logInfo(`${stem}.txt — 判斷為 URL（${tokens.length} 筆 / detected as URLs: ${tokens.length}）`);
    if (tokens.length === 1) {
      await addResult(stem, tokens[0]);
      logOk(`${stem}`);
    } else {
      for (let i = 0; i < tokens.length; i++) {
        const fname = `${stem}_${String(i + 1).padStart(5, "0")}`;
        await addResult(fname, tokens[i]);
        logOk(fname);
      }
    }
  } else {
    const firstNonUrl = tokens.find((_, i) => !flags[i]);
    logInfo(`${stem}.txt — 判斷為文本（含非網址內容：「${(firstNonUrl || "").slice(0, 40)}」/ treated as plain text）`);
    await addResult(stem, trimmed);
    logOk(stem);
  }
}

/* ── CSV processing ──────────────────────────────────────────────── */
async function processCsv(content, stem) {
  const text = content.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) { logWarn(`${stem}.csv — 空檔案`); return; }

  const headers = parseCsvLine(lines[0]);
  if (!headers.includes("類型")) {
    logErr(`${stem}.csv — 缺少必要欄位「類型」/ missing required column "類型"`);
    return;
  }

  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const rawRow = {};
    headers.forEach((h, idx) => { rawRow[h] = values[idx] ?? ""; });
    try {
      const row  = normalizeRow(rawRow);
      const data = formatQrData(row);
      if (!data) continue;
      const fname = generateFilename(row, count + 1);
      await addResult(fname, data);
      logOk(`行 ${i} → ${fname}`);
      count++;
    } catch (err) {
      logErr(`${stem}.csv 第 ${i} 行：${err.message}`);
    }
  }
  if (count === 0) logWarn(`${stem}.csv — 沒有產生任何 QR code`);
}

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ",") { result.push(cur); cur = ""; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

/* ── Excel processing ────────────────────────────────────────────── */
async function processExcel(arrayBuffer, stem) {
  const wb    = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) { logErr(`${stem}.xlsx — 無法讀取工作表 / cannot read sheet`); return; }

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (aoa.length === 0) { logWarn(`${stem}.xlsx — 空工作表 / empty sheet`); return; }

  const headers = aoa[0].map(h => String(h ?? "").trim());
  if (!headers.includes("類型")) {
    logErr(`${stem}.xlsx — 缺少必要欄位「類型」/ missing required column "類型"`);
    return;
  }

  let count = 0;
  for (let i = 1; i < aoa.length; i++) {
    const values = aoa[i];
    const rawRow = {};
    headers.forEach((h, idx) => {
      const v = values[idx];
      rawRow[h] = (v === null || v === undefined) ? "" : v;
    });
    try {
      const row  = normalizeRow(rawRow);
      const data = formatQrData(row);
      if (!data) continue;
      const fname = generateFilename(row, count + 1);
      await addResult(fname, data);
      logOk(`行 ${i} → ${fname}`);
      count++;
    } catch (err) {
      logErr(`${stem}.xlsx 第 ${i} 行：${err.message}`);
    }
  }
  if (count === 0) logWarn(`${stem}.xlsx — 沒有產生任何 QR code`);
}

/* ── File dispatcher ─────────────────────────────────────────────── */
async function processFile(file) {
  const name = file.name;
  const ext  = name.slice(name.lastIndexOf(".")).toLowerCase();
  const stem = sanitizeFilename(name.slice(0, name.lastIndexOf(".")));

  logInfo(`開始處理 / Processing: ${name}`);

  if (ext === ".txt") {
    await processTxt(await readAsText(file), stem);
  } else if (ext === ".csv") {
    await processCsv(await readAsText(file), stem);
  } else if (ext === ".xlsx") {
    await processExcel(await readAsArrayBuffer(file), stem);
  } else {
    logErr(`不支援的格式 / Unsupported format: ${name}`);
  }
}

/* ── File reader wrappers ────────────────────────────────────────── */
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file, "utf-8");
  });
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(file);
  });
}

/* ── Main entry: handle a FileList ───────────────────────────────── */
async function handleFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  clearLog();
  clearResults();
  showSpinner();

  for (const file of Array.from(fileList)) {
    await processFile(file);
  }

  hideSpinner();
  const n = results.length;
  if (n > 0) {
    logInfo(`✅ 完成！共產生 ${n} 張 QR Code / Done! ${n} QR code(s) generated.`);
    updateToolbar();
  } else {
    logWarn("沒有產生任何 QR code，請確認輸入檔案格式。/ No QR codes generated — check input file format.");
  }
}

/* ── Quick input wiring ──────────────────────────────────────────── */
const qiType     = document.getElementById("qi-type");
const qiDataRow  = document.getElementById("qi-data-row");
const qiWifiRows = document.getElementById("qi-wifi-rows");
const qiError    = document.getElementById("qi-error");

const qiDataField = document.getElementById("qi-data");

function qiTimestampBase() {
  const now = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `Qrcode_${date}_${time}`;
}

function qiDefaultName(index = 1) {
  return `${qiTimestampBase()}_${String(index).padStart(3, "0")}`;
}

const QI_PLACEHOLDERS = {
  url:  "https://example.com, https://github.com（逗號分隔多筆 / comma-separated）",
  text: "在此輸入文字內容… / Enter text content here…",
};

qiType.addEventListener("change", () => {
  const type   = qiType.value;
  const isWifi = type === "wifi";
  qiDataRow.style.display = isWifi ? "none" : "";
  qiWifiRows.classList.toggle("visible", isWifi);
  qiDataField.classList.toggle("expanded", type === "text");
  qiDataField.placeholder = QI_PLACEHOLDERS[type] ?? "";
  qiError.textContent = "";
});

document.getElementById("qi-btn").addEventListener("click", async () => {
  qiError.textContent = "";
  const type = qiType.value;

  let data = "";

  clearLog();
  clearResults();
  showSpinner();

  if (type === "wifi") {
    const ssid     = document.getElementById("qi-ssid").value.trim();
    const password = document.getElementById("qi-password").value.trim();
    const security = document.getElementById("qi-security").value;
    if (!ssid) { hideSpinner(); qiError.textContent = "請填寫 WiFi 名稱 / SSID is required"; return; }
    data = `WIFI:T:${security};S:${ssid};P:${password};;`;
    const nameInput = document.getElementById("qi-name").value.trim();
    const filename  = nameInput ? sanitizeFilename(nameInput) : qiDefaultName();
    try {
      await addResult(filename, data);
      logOk(`${filename} — 產生成功 / generated`);
    } catch (err) { logErr(err.message); }

  } else if (type === "url") {
    const raw = document.getElementById("qi-data").value.trim();
    if (!raw) { hideSpinner(); qiError.textContent = "請填寫 URL / URL is required"; return; }
    const urls = raw.split(",").map(u => u.trim()).filter(Boolean);
    const nameInput = document.getElementById("qi-name").value.trim();
    // Pre-compute base name once so all URLs in the batch share the same timestamp.
    const base = nameInput ? sanitizeFilename(nameInput) : qiTimestampBase();
    for (let i = 0; i < urls.length; i++) {
      const seq   = String(i + 1).padStart(3, "0");
      const fname = urls.length === 1 ? base : `${base}_${seq}`;
      try {
        await addResult(fname, urls[i]);
        logOk(`${fname} — ${urls[i].slice(0, 50)}`);
      } catch (err) { logErr(`${urls[i].slice(0, 40)}: ${err.message}`); }
    }

  } else {
    data = document.getElementById("qi-data").value.trim();
    if (!data) { hideSpinner(); qiError.textContent = "請填寫資料 / Data is required"; return; }
    const nameInput = document.getElementById("qi-name").value.trim();
    const filename  = nameInput ? sanitizeFilename(nameInput) : qiDefaultName();
    try {
      await addResult(filename, data);
      logOk(`${filename} — 產生成功 / generated`);
    } catch (err) { logErr(err.message); }
  }

  hideSpinner();
  updateToolbar();
});

/* ── Single-result direct download button ────────────────────────── */
document.getElementById("single-dl-btn").addEventListener("click", () => {
  if (results.length !== 1) return;
  const { filename, qr } = results[0];
  downloadSingle(filename, qr);
});

/* ── Drop zone wiring ────────────────────────────────────────────── */
const dropZone  = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) {
    handleFiles(fileInput.files);
    fileInput.value = "";
  }
});

dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove("drag-over"); });
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const files = e.dataTransfer.files;
  if (files.length) handleFiles(files);
});

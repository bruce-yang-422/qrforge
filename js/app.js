// @ts-nocheck
/* ===================================================================
   QR Code generation — browser port of main.py
   QRCode / XLSX / JSZip are loaded from libs/ before this script.
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

const BATCH_LIMIT = 500;

/* ── Helpers ─────────────────────────────────────────────────────── */
const _URL_RE      = /^https?:\/\/[^\s]+$/;
const _NON_URL_RE  = /[一-鿿぀-ヿ㐀-䶿＀-￯]/;
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
// Details stay folded away unless something needs the user's attention.
const logWrap = document.getElementById("log-wrap");
const logArea = document.getElementById("log-area");

function log(msg, cls = "log-info") {
  logWrap.hidden = false;
  if (cls === "log-err" || cls === "log-warn") logWrap.open = true;
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
  logWrap.hidden = true;
  logWrap.open = false;
}

/* ── Spinner ─────────────────────────────────────────────────────── */
const spinner    = document.getElementById("spinner");
const spinnerMsg = document.getElementById("spinner-msg");

function showSpinner() {
  spinnerMsg.textContent = tr("處理中…", "Working…");
  spinner.classList.add("visible");
}
function hideSpinner() {
  spinner.classList.remove("visible");
}

/* ── Read settings from the UI ───────────────────────────────────── */
function getSettings() {
  return {
    ecl:    document.getElementById("opt-ecl").value,
    scale:  Math.min(20, Math.max(2, parseInt(document.getElementById("opt-scale").value, 10) || 8)),
    format: document.querySelector("input[name='opt-fmt']:checked").value,
  };
}

/* ── QR generation — returns { format, matrix, moduleMm, canvas?, svg? } ── */
// Uses qrcode-generator (global: `qrcode` lowercase function).
// The library's default keeps only the low byte of each character, which corrupts CJK and emoji.
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

function makeQr(data) {
  const { ecl, scale, format } = getSettings();

  // typeNumber 0 = auto-detect.
  const qr = qrcode(0, ecl);
  qr.addData(data, "Byte");
  qr.make();

  const modules = qr.getModuleCount();
  const matrix  = { size: modules, isDark: (r, c) => qr.isDark(r, c) };
  const moduleMm = scale * 0.25;

  if (format === "SVG") {
    const svgStr = qr.createSvgTag(scale, 4 * scale);
    return { format: "SVG", svg: svgStr, matrix, moduleMm };
  }

  // Render onto an off-screen canvas (PNG / JPG, and the PDF preview).
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

  return { format, canvas, matrix, moduleMm };
}

function previewNode(filename, qr) {
  if (qr.format === "SVG") {
    const img = document.createElement("img");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr.svg);
    img.alt = filename;
    return img;
  }
  const display = document.createElement("canvas");
  display.width  = qr.canvas.width;
  display.height = qr.canvas.height;
  display.getContext("2d").drawImage(qr.canvas, 0, 0);
  return display;
}

/* ── Results state ───────────────────────────────────────────────── */
// Each entry: { filename: string, qr: { format, matrix, moduleMm, canvas?, svg? } }
const results = [];
let limitWarned = false;

function clearResults() {
  results.length = 0;
  limitWarned = false;
  document.getElementById("results-grid").innerHTML = "";
  document.getElementById("toolbar").classList.remove("visible");
}

function renderCard(filename, qr) {
  const card = document.createElement("div");
  card.className = "qr-card";

  const wrap = document.createElement("div");
  wrap.className = "qr-canvas-wrap";
  wrap.appendChild(previewNode(filename, qr));

  const label = document.createElement("div");
  label.className = "qr-filename";
  label.textContent = `${filename}.${qr.format.toLowerCase()}`;

  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "btn btn-secondary btn-sm";
  dlBtn.textContent = tr("下載", "Download");
  dlBtn.addEventListener("click", () => downloadSingle(filename, qr));

  card.appendChild(wrap);
  card.appendChild(label);
  card.appendChild(dlBtn);
  document.getElementById("results-grid").appendChild(card);
}

const zipLabel = () => tr("全部下載 (ZIP)", "Download all (ZIP)");

function updateToolbar() {
  const toolbar = document.getElementById("toolbar");
  const zipBtn  = document.getElementById("zip-btn");
  const dlBtn   = document.getElementById("single-dl-btn");
  const n       = results.length;

  toolbar.classList.toggle("visible", n > 0);
  document.getElementById("count-label").textContent = tr(`已產生 ${n} 張`, `${n} QR code${n === 1 ? "" : "s"} ready`);
  document.getElementById("zip-label").textContent = zipLabel();
  zipBtn.hidden = n < 2;
  dlBtn.hidden  = n !== 1;
}

/* ── Add a single generated QR to the UI ─────────────────────────── */
function limitReached() {
  if (results.length < BATCH_LIMIT) return false;
  if (!limitWarned) {
    limitWarned = true;
    logWarn(tr(`已達每批 ${BATCH_LIMIT} 張上限，其餘內容未產生`, `Reached the limit of ${BATCH_LIMIT} per batch. The rest was skipped`));
  }
  return true;
}

async function addResult(filename, data) {
  const qr = makeQr(data);
  results.push({ filename, qr });
  renderCard(filename, qr);
  updateToolbar();
  // Let the page repaint during large batches.
  if (results.length % 25 === 0) await new Promise(resolve => setTimeout(resolve));
}

/* ── Download helpers ────────────────────────────────────────────── */
function downloadSingle(filename, qr) {
  const a   = document.createElement("a");
  const ext = qr.format.toLowerCase();

  if (qr.format === "PDF") {
    const blob = new Blob([QRPrint.qrPdf(qr.matrix, qr.moduleMm, qr.caption)], { type: "application/pdf" });
    a.href     = URL.createObjectURL(blob);
    a.download = `${filename}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else if (qr.format === "SVG") {
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

document.getElementById("zip-btn").addEventListener("click", async () => {
  if (results.length === 0) return;
  const zipBtn = document.getElementById("zip-btn");
  const label  = document.getElementById("zip-label");
  zipBtn.disabled = true;
  label.textContent = tr("打包中…", "Packing…");

  const zip = new JSZip();
  for (const { filename, qr } of results) {
    const ext = qr.format.toLowerCase();
    if (qr.format === "PDF") {
      zip.file(`${filename}.pdf`, QRPrint.qrPdf(qr.matrix, qr.moduleMm));
    } else if (qr.format === "SVG") {
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
  label.textContent = zipLabel();
});

/* ── Label sheet PDF ─────────────────────────────────────────────── */
const labelSelect = document.getElementById("label-layout");
for (const [key, layout] of Object.entries(QRPrint.LABEL_LAYOUTS)) {
  labelSelect.add(new Option(layout.name, key));
}

// Below this size many phone cameras struggle to resolve the modules.
const MIN_LABEL_MODULE_MM = 0.33;

document.getElementById("label-btn").addEventListener("click", () => {
  if (results.length === 0) return;
  const key    = labelSelect.value;
  const layout = QRPrint.LABEL_LAYOUTS[key];
  const tooSmall = results.filter(({ qr }) =>
    QRPrint.qrLabelModule(qr.matrix, layout.label[0], layout.label[1]) < MIN_LABEL_MODULE_MM).length;
  if (tooSmall) {
    logWarn(tr(
      `${tooSmall} 張 QR Code 在這種標籤上會太小，可能難以掃描，建議改用較大的標籤`,
      `${tooSmall} QR code(s) would be too small on this label and may be hard to scan. Try a larger label`,
    ));
  }

  const bytes = QRPrint.labelSheet(key, results.length, (cell, pageHeight) =>
    QRPrint.qrLabelOps(results[cell.index].qr.matrix, cell, pageHeight));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a   = document.createElement("a");
  a.href     = url;
  a.download = `qrcode-labels-${key}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
  const sheets = Math.ceil(results.length / (layout.cols * layout.rows));
  logOk(tr(`標籤 PDF：${results.length} 張，共 ${sheets} 頁`, `Label PDF: ${results.length} labels on ${sheets} page(s)`));
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
  throw new Error(tr(`不支援的類型「${row.type}」`, `Unsupported type: "${row.type}"`));
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
  if (!trimmed) { logWarn(tr(`${stem}.txt：檔案是空的`, `${stem}.txt: the file is empty`)); return; }

  const tokens = splitTokens(trimmed);
  const flags  = tokens.map(isUrl);

  if (tokens.length > 0 && flags.every(Boolean)) {
    logInfo(tr(`${stem}.txt：判斷為 ${tokens.length} 個網址`, `${stem}.txt: found ${tokens.length} URL(s)`));
    if (tokens.length === 1) {
      await addResult(stem, tokens[0]);
      logOk(`${stem}`);
    } else {
      for (let i = 0; i < tokens.length; i++) {
        if (limitReached()) break;
        const fname = `${stem}_${String(i + 1).padStart(5, "0")}`;
        await addResult(fname, tokens[i]);
        logOk(fname);
      }
    }
  } else {
    logInfo(tr(`${stem}.txt：判斷為純文字，整份檔案產生一張`, `${stem}.txt: treated as plain text, one code for the whole file`));
    await addResult(stem, trimmed);
    logOk(stem);
  }
}

/* ── CSV processing ──────────────────────────────────────────────── */
async function processCsv(content, stem) {
  const text = content.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) { logWarn(tr(`${stem}.csv：檔案是空的`, `${stem}.csv: the file is empty`)); return; }

  const headers = parseCsvLine(lines[0]);
  if (!headers.includes("類型")) {
    logErr(tr(`${stem}.csv：缺少必要欄位「類型」，可下載範本參考`, `${stem}.csv: missing the required column "類型". See the template`));
    return;
  }

  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    if (limitReached()) break;
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
      logOk(fname);
      count++;
    } catch (err) {
      logErr(tr(`${stem}.csv 第 ${i} 行：${err.message}`, `${stem}.csv line ${i}: ${err.message}`));
    }
  }
  if (count === 0) logWarn(tr(`${stem}.csv：沒有可產生的內容`, `${stem}.csv: nothing to create`));
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
  if (!sheet) { logErr(tr(`${stem}.xlsx：無法讀取工作表`, `${stem}.xlsx: can't read the sheet`)); return; }

  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (aoa.length === 0) { logWarn(tr(`${stem}.xlsx：工作表是空的`, `${stem}.xlsx: the sheet is empty`)); return; }

  const headers = aoa[0].map(h => String(h ?? "").trim());
  if (!headers.includes("類型")) {
    logErr(tr(`${stem}.xlsx：缺少必要欄位「類型」，可下載範本參考`, `${stem}.xlsx: missing the required column "類型". See the template`));
    return;
  }

  let count = 0;
  for (let i = 1; i < aoa.length; i++) {
    if (limitReached()) break;
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
      logOk(fname);
      count++;
    } catch (err) {
      logErr(tr(`${stem}.xlsx 第 ${i} 行：${err.message}`, `${stem}.xlsx row ${i}: ${err.message}`));
    }
  }
  if (count === 0) logWarn(tr(`${stem}.xlsx：沒有可產生的內容`, `${stem}.xlsx: nothing to create`));
}

/* ── File dispatcher ─────────────────────────────────────────────── */
async function processFile(file) {
  const name = file.name;
  const ext  = name.slice(name.lastIndexOf(".")).toLowerCase();
  const stem = sanitizeFilename(name.slice(0, name.lastIndexOf(".")));

  if (ext === ".txt") {
    await processTxt(await readAsText(file), stem);
  } else if (ext === ".csv") {
    await processCsv(await readAsText(file), stem);
  } else if (ext === ".xlsx") {
    await processExcel(await readAsArrayBuffer(file), stem);
  } else {
    logErr(tr(`不支援這種檔案：${name}`, `Unsupported file: ${name}`));
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

/* ── Batch runs ──────────────────────────────────────────────────── */
// Remembered so that changing the format or size can rebuild the batch.
let lastBatchRun = null;

async function runBatch(work) {
  lastBatchRun = () => runBatch(work);
  clearLog();
  clearResults();
  showSpinner();
  await work();
  hideSpinner();
  updateToolbar();
  if (results.length === 0) {
    logWarn(tr("沒有產生任何 QR Code，請確認內容或檔案格式", "No QR codes were created. Check the content or file format"));
  }
}

function handleFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  runBatch(async () => {
    for (const file of files) {
      if (limitReached()) break;
      await processFile(file);
    }
  });
}

/* ── Batch list: one QR code per line ────────────────────────────── */
document.getElementById("batch-list-btn").addEventListener("click", () => {
  const lines = document.getElementById("batch-list").value
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const error = document.getElementById("batch-list-error");
  error.textContent = "";
  if (lines.length === 0) { error.textContent = tr("請至少輸入一行", "Enter at least one line"); return; }

  runBatch(async () => {
    for (let i = 0; i < lines.length; i++) {
      if (limitReached()) break;
      const fname = generateFilename({ type: isUrl(lines[i]) ? "url" : "text" }, i + 1);
      try {
        await addResult(fname, lines[i]);
        logOk(fname);
      } catch (err) {
        logErr(tr(`第 ${i + 1} 行：內容太長`, `Line ${i + 1}: the content is too long`));
      }
    }
  });
});

/* ── QR Code tab: the preview updates as you type ────────────────── */
const stage       = document.getElementById("qp-stage");
const stageEmpty  = document.getElementById("qp-empty");
const qiError     = document.getElementById("qi-error");
const qiData      = document.getElementById("qi-data");
const qiDownload  = document.getElementById("qp-download");
const qiCaption   = document.getElementById("qi-caption");
const qiFont      = document.getElementById("qi-font");
const shareStatus = document.getElementById("qp-share-status");
let quickQr = null;

const qiType = () => document.querySelector("input[name='qi-type']:checked").value;

function qiDefaultName() {
  const now = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `Qrcode_${date}_${time}_001`;
}

// A bare domain would scan as plain text, so make it a real link.
function completeUrl(value) {
  const looksLikeDomain = /^[^\s/:@]+\.[^\s/:@.]{2,}(?:[/?#:]\S*)?$/.test(value);
  return looksLikeDomain ? `https://${value}` : value;
}

function quickPayload() {
  if (qiType() === "url") return completeUrl(qiData.value.trim());
  if (qiType() === "text") return qiData.value.trim();
  const ssid = document.getElementById("qi-ssid").value.trim();
  if (!ssid) return "";
  const password = document.getElementById("qi-password").value.trim();
  const security = document.getElementById("qi-security").value;
  return `WIFI:T:${security};S:${ssid};P:${security === "nopass" ? "" : password};;`;
}

function emptyMessage() {
  if (qiType() === "wifi") return tr("輸入 WiFi 名稱後，QR Code 會顯示在這裡", "Enter a network name and your QR code appears here");
  return tr("開始輸入，QR Code 就會顯示在這裡", "Start typing and your QR code appears here");
}

// Sized from the code's width, so the text keeps its proportions at any size.
function captionLimits(widthMm) {
  return { size: widthMm * 0.07, minSize: widthMm * 0.035, gap: 0, bottom: widthMm * 0.04, margin: widthMm * 0.04 };
}

// The quiet zone stays intact because the text goes below it.
function withCaption(qr) {
  const widthMm = (qr.matrix.size + 8) * qr.moduleMm;
  const caption = QRPrint.layoutCaption(qiCaption.value, widthMm, captionLimits(widthMm), qiFont.value);
  if (!caption) return qr;
  if (caption.tooLong) throw new RangeError("caption");

  if (qr.format !== "SVG") {
    const pxPerMm = qr.canvas.width / widthMm;
    return { ...qr, caption, canvas: QRPrint.paintWithCaption(document.createElement("canvas"), qr.canvas, caption, pxPerMm) };
  }
  const unitMm = qr.moduleMm / getSettings().scale;
  const width  = Math.round(widthMm / unitMm);
  const height = Math.round((widthMm + caption.extra) / unitMm);
  const paths  = QRPrint.captionSvg(caption, widthMm, width + caption.gap / unitMm, unitMm);
  const svg = qr.svg
    .replace(/ width="[^"]*" height="[^"]*"/, ` width="${width}px" height="${height}px"`)
    .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${width} ${height}"`)
    .replace("</svg>", `${paths}</svg>`);
  return { ...qr, caption, svg };
}

function renderQuick() {
  qiError.textContent = "";
  shareStatus.textContent = "";
  const data = quickPayload();
  quickQr = null;
  stage.querySelectorAll("canvas, img").forEach(node => node.remove());
  stageEmpty.textContent = emptyMessage();
  stageEmpty.hidden = false;

  const fontState = data && qiCaption.value.trim() ? QRPrint.prepareCaptionFont(qiFont.value, renderQuick) : "ready";
  if (fontState === "loading") {
    stageEmpty.textContent = tr("正在下載字型，只有第一次需要…", "Downloading the font. This only happens once…");
  } else if (data) {
    try {
      quickQr = withCaption(makeQr(data));
      stage.appendChild(previewNode(tr("QR Code 預覽", "QR code preview"), quickQr));
      stageEmpty.hidden = true;
      if (fontState === "failed") qiError.textContent = tr("字型下載失敗，目前顯示的是黑體。連上網路後再改一次文字或字型即可重試。", "The font couldn't be downloaded, so this is using a sans-serif. Once you're online, change the text or font to try again.");
    } catch (err) {
      qiError.textContent = err instanceof RangeError
        ? tr("下方文字太長，請縮短文字", "The text below the code is too long. Please shorten it")
        : tr("內容太長，放不進一張 QR Code。請縮短內容或降低防損傷程度。", "That's too much for one QR code. Shorten it or lower the damage protection.");
    }
  }
  qiDownload.disabled = !quickQr;
  updateShareRow();
  const typed = qiData.value.trim();
  document.getElementById("qi-data-hint").textContent = qiType() === "url" && data && data !== typed
    ? tr(`會自動加上 https://，掃描後開啟 ${data}`, `https:// was added, so it opens ${data}`)
    : "";
  document.getElementById("qp-download-label").textContent = tr(`下載 ${getSettings().format}`, `Download ${getSettings().format}`);
}

function updateTypeFields() {
  const type = qiType();
  const isWifi = type === "wifi";
  document.getElementById("qi-data-row").hidden = isWifi;
  document.getElementById("qi-wifi-rows").hidden = !isWifi;
  document.getElementById("qi-data-label").textContent = type === "url" ? tr("網址", "Link") : tr("文字內容", "Text");
  qiData.placeholder = type === "url" ? "https://example.com" : tr("在這裡輸入文字…", "Type your text here…");
  document.getElementById("qi-password-row").hidden = document.getElementById("qi-security").value === "nopass";
}

let quickTimer = null;
function scheduleQuick() {
  clearTimeout(quickTimer);
  quickTimer = setTimeout(renderQuick, 100);
}

document.querySelectorAll("input[name='qi-type']").forEach(input => input.addEventListener("change", () => {
  updateTypeFields();
  renderQuick();
  if (qiType() !== "wifi") qiData.focus();
}));
document.getElementById("qi-security").addEventListener("change", () => { updateTypeFields(); renderQuick(); });
qiFont.addEventListener("change", renderQuick);
for (const id of ["qi-data", "qi-ssid", "qi-password", "qi-caption"]) {
  document.getElementById(id).addEventListener("input", scheduleQuick);
}

qiDownload.addEventListener("click", () => {
  if (!quickQr) return;
  const name = document.getElementById("qi-name").value.trim();
  downloadSingle(name ? sanitizeFilename(name) : qiDefaultName(), quickQr);
});

/* ── Sharing the current QR code ─────────────────────────────────── */
const SHARE_PX_PER_MODULE = 12;

// Drawn fresh at a size that looks sharp in a chat, whatever the download format.
function quickShareCanvas() {
  const { matrix, moduleMm, caption } = quickQr;
  const size   = (matrix.size + 8) * SHARE_PX_PER_MODULE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.isDark(r, c)) ctx.fillRect((c + 4) * SHARE_PX_PER_MODULE, (r + 4) * SHARE_PX_PER_MODULE, SHARE_PX_PER_MODULE, SHARE_PX_PER_MODULE);
    }
  }
  return QRPrint.paintWithCaption(document.createElement("canvas"), canvas, caption, SHARE_PX_PER_MODULE / moduleMm);
}

const quickFilename = () => {
  const name = document.getElementById("qi-name").value.trim();
  return name ? sanitizeFilename(name) : qiDefaultName();
};

const updateShareButtons = QRShare.wire({
  shareButton: document.getElementById("qp-share"),
  copyButton:  document.getElementById("qp-copy"),
  status:      shareStatus,
  getCanvas:   quickShareCanvas,
  getName:     quickFilename,
});

function updateShareRow() {
  document.getElementById("qp-share-row").hidden = !quickQr;
  updateShareButtons();
}

/* ── Shared settings ─────────────────────────────────────────────── */
const settingsNode = document.getElementById("qr-settings");

function updateFormatHint() {
  const hints = {
    PNG: tr("適合大多數用途，例如網頁、文件與一般列印", "Good for most uses: web, documents, and everyday printing"),
    SVG: tr("可任意放大不失真，適合設計與大型印刷", "Scales to any size. Best for design work and large prints"),
    JPG: tr("適合只接受 JPG 的系統", "For systems that only accept JPG"),
    PDF: tr("可直接列印或交給印刷廠", "Ready to print or send to a print shop"),
  };
  document.getElementById("format-hint").textContent = hints[getSettings().format];
}

let settingsTimer = null;
settingsNode.addEventListener("input", () => {
  updateFormatHint();
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    renderQuick();
    if (results.length > 0 && lastBatchRun) lastBatchRun();
  }, 200);
});

// The settings sit in the tab being used, and are hidden on the others.
document.addEventListener("qrtabchange", (e) => {
  const slot = document.getElementById(`settings-slot-${e.detail}`);
  settingsNode.hidden = !slot;
  if (slot) slot.appendChild(settingsNode);
});

document.addEventListener("qrlangchange", () => {
  updateTypeFields();
  updateFormatHint();
  renderQuick();
  if (results.length > 0) updateToolbar();
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

dropZone.addEventListener("click", e => {
  if (e.target.closest("a") || e.target === fileInput) return;
  fileInput.click();
});
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

updateTypeFields();
updateFormatHint();
renderQuick();

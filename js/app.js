// @ts-nocheck
/* ===================================================================
   QR Code generation — browser port of main.py
   QRCode is loaded from libs/ before this script. XLSX and JSZip are large
   and only needed for some batch work, so they load on first use.
   =================================================================== */

/* ── Column map (mirrors Python COLUMN_MAP) ──────────────────────── */
const COLUMN_MAP = {
  "類型":          "type",
  "資料":          "data",
  "WiFi名稱":      "ssid",
  "WiFi密碼":      "password",
  "加密方式":      "security",
  "Qr-code檔案名稱": "name",
  "國碼":          "country",
  "電話號碼":       "phone",
  "主旨":          "subject",
  "內文":          "body",
  "姓":            "family",
  "名":            "given",
  "姓名":          "fullName",
  "暱稱":          "nickname",
  "顯示名稱":       "displayName",
  "公司":          "org",
  "職稱":          "title",
  "Email":         "email",
  "網站":          "url",
};

const BATCH_LIMIT = 500;

/* ── Helpers ─────────────────────────────────────────────────────── */
const _URL_RE      = /^https?:\/\/[^\s]+$/;
const _NON_URL_RE  = /[一-鿿぀-ヿ㐀-䶿＀-￯]/;
const _ILLEGAL_RE  = /[\\/:*?"<>|]/g;

function sanitizeFilename(name) {
  return String(name).replace(_ILLEGAL_RE, "");
}

// Backslash, semicolon, comma, colon and quote are structural in a WiFi code.
function wifiPayload(security, ssid, password) {
  const escape = (value) => String(value).replace(/[\\;,:"]/g, "\\$&");
  return `WIFI:T:${security};S:${escape(ssid)};P:${escape(password)};;`;
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
    logoSize: Number(document.getElementById("opt-logo-size").value),
  };
}

/* ── QR generation — returns { format, matrix, moduleMm, canvas?, svg? } ── */
// Uses qrcode-generator (global: `qrcode` lowercase function).
// The library's default keeps only the low byte of each character, which corrupts CJK and emoji.
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

function makeQr(data) { return QRExtras.render(data, getSettings()); }

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
  updateBatchLabelFit();
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
    const blob = new Blob([QRExtras.pdf(qr)], { type: "application/pdf" });
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

  try {
    await QRTabs.loadScript("libs/jszip.min.js");
  } catch {
    logErr(tr("無法載入 ZIP 工具，請確認網路連線後再試一次", "The ZIP tool couldn't be loaded. Check your connection and try again"));
    zipBtn.disabled = false;
    label.textContent = zipLabel();
    return;
  }

  const zip = new JSZip();
  for (const { filename, qr } of results) {
    const ext = qr.format.toLowerCase();
    if (qr.format === "PDF") {
      zip.file(`${filename}.pdf`, QRExtras.pdf(qr));
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
QRPrint.wireLabelSelect(labelSelect);

// Batch labels always fill the label, so the question is whether the densest code stays readable.
function updateBatchLabelFit() {
  const box = document.getElementById("label-fit");
  if (!results.length) { box.textContent = ""; return; }
  const densest = Math.max(...results.map(({ qr }) => qr.matrix.size));
  const sideOf = (layout) => Math.min(layout.label[0], layout.label[1]) - 4;
  const tooSmall = (layout) => sideOf(layout) / (densest + 8) < MIN_LABEL_MODULE_MM;
  for (const option of labelSelect.options) markSheet(option, tooSmall(QRPrint.LABEL_LAYOUTS[option.value]) ? tr("太小", "too small") : "");
  const layout = QRPrint.LABEL_LAYOUTS[labelSelect.value];
  const side = sideOf(layout).toFixed(1);
  box.className = `fit-status ${tooSmall(layout) ? "small" : "ok"}`;
  box.textContent = tooSmall(layout)
    ? tr(`⚠ 太小：最多約 ${side} mm，內容最多的 QR Code 可能難以掃描`, `⚠ Too small: about ${side} mm at most, so the densest QR code may be hard to scan`)
    : tr(`✓ 每張自動符合標籤，最多約 ${side} mm`, `✓ Each fits its label, at about ${side} mm at most`);
}
labelSelect.addEventListener("change", updateBatchLabelFit);

// Below this size many phone cameras struggle to resolve the modules.
const MIN_LABEL_MODULE_MM = 0.33;
document.getElementById("label-caption-mode").addEventListener("change", (event) => {
  document.getElementById("label-caption").hidden = event.target.value !== "custom";
});

document.getElementById("label-btn").addEventListener("click", () => {
  if (!results.length) return;
  try {
    const key = labelSelect.value;
    const mode = document.getElementById("label-caption-mode").value;
    let tooSmall = 0;
    const bytes = QRPrint.labelSheet(key, results.length, (cell, pageHeight) => {
      const { qr, filename } = results[cell.index];
      const text = mode === "filename" ? filename : mode === "custom" ? document.getElementById("label-caption").value : "";
      const widthMm = Math.min(cell.width - 4, cell.height - (text ? 9 : 4));
      const caption = QRPrint.layoutCaption(text, widthMm, captionLimits(widthMm), "sans");
      if (caption?.tooLong) throw new Error(tr("標籤文字太長，請縮短文字", "Label text is too long. Please shorten it"));
      const moduleMm = widthMm / (qr.matrix.size + 8);
      if (moduleMm < MIN_LABEL_MODULE_MM) tooSmall++;
      const canvas = QRPrint.paintWithCaption(document.createElement("canvas"), qr.canvas, caption, qr.canvas.width / widthMm);
      const heightMm = canvas.height * widthMm / canvas.width;
      return QRPrint.vectorOps(QRExtras.vector(canvas), cell.x + (cell.width-widthMm)/2, cell.y + (cell.height-heightMm)/2, widthMm/canvas.width, pageHeight);
    });
    if (tooSmall) {
      logWarn(tr(
        `${tooSmall} 張 QR Code 在這種標籤上會太小，可能難以掃描，建議改用較大的標籤`,
        `${tooSmall} QR code(s) would be too small on this label and may be hard to scan. Try a larger label`,
      ));
    }
    const url = URL.createObjectURL(new Blob([bytes], {type:"application/pdf"}));
    const a = document.createElement("a"); a.href = url; a.download = `qrcode-labels-${key}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) { logErr(err.message); }
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
  if (["phone", "sms", "vcard"].includes(t)) {
    // Earlier files kept the number in 資料, and a contact's name in `name`.
    const number = t === "vcard" ? row.phone : row.phone || row.data;
    const full = QRExtras.phoneNumber(row.country, number);
    if (full === null) throw new Error(tr(`國碼「${row.country}」不正確，請輸入 1 到 4 位數字`, `Country code "${row.country}" isn't valid. Use 1 to 4 digits`));
    if (t === "vcard") return QRExtras.payload(t, { ...row, name: row.fullName || row.name });
    return QRExtras.payload(t, { ...row, data: full });
  }
  if (t === "email") return QRExtras.payload(t, row);
  if (["url", "text", "line"].includes(t)) return row.data || "";
  if (t === "wifi") {
    const security = row.security || "WPA";
    return wifiPayload(security, row.ssid || "", row.password || "");
  }
  throw new Error(tr(`不支援的類型「${row.type}」`, `Unsupported type: "${row.type}"`));
}

function generateFilename(row, index) {
  const name = row.name || QRExtras.contactName({ ...row, name: row.fullName }).full || row.ssid;
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
  try {
    await QRTabs.loadScript("libs/xlsx.full.min.js");
  } catch {
    logErr(tr(`${stem}.xlsx：無法載入 Excel 工具，請確認網路連線後再試一次`, `${stem}.xlsx: the Excel tool couldn't be loaded. Check your connection and try again`));
    return;
  }

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
  updateScaleHint();
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
const qiCountrySelect = document.getElementById("qi-country-select");
const qiCountryCode   = document.getElementById("qi-country-code");
const qiContactCountry = document.getElementById("qi-contact-country");
const qiContactCode    = document.getElementById("qi-contact-code");
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
  if (["vcard", "email", "phone", "sms"].includes(qiType())) {
    const row = { data: qiData.value, subject: document.getElementById("qi-subject").value, body: document.getElementById("qi-body").value };
    for (const key of ["family", "given", "nickname", "displayName", "org", "title", "phone", "email", "url"]) row[key] = document.getElementById(`qi-contact-${key}`).value.trim();
    row.country = qiContactCode.value;
    if (["phone", "sms"].includes(qiType())) row.data = QRExtras.phoneNumber(qiCountryCode.value, document.getElementById("qi-phone").value) ?? "";
    return QRExtras.payload(qiType(), row);
  }
  if (qiType() === "url") return completeUrl(qiData.value.trim());
  if (qiType() === "text") return qiData.value.trim();
  const ssid = document.getElementById("qi-ssid").value.trim();
  if (!ssid) return "";
  const password = document.getElementById("qi-password").value.trim();
  const security = document.getElementById("qi-security").value;
  return wifiPayload(security, ssid, security === "nopass" ? "" : password);
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
  return { ...qr, caption, svg, canvas: QRPrint.paintWithCaption(document.createElement("canvas"), qr.canvas, caption, qr.canvas.width / widthMm) };
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
  updatePhoneHints();
  updateScaleHint();
  document.getElementById("qp-download-label").textContent = tr(`下載 ${getSettings().format}`, `Download ${getSettings().format}`);
}

// Shows the number the code will really dial, since a leading 0 may have been dropped.
// Names the exact size, and says so when the preview had to shrink to fit.
function updateScaleHint() {
  const hint = document.getElementById("opt-scale-hint");
  const qr = quickQr || results[0]?.qr;
  const { scale, format } = getSettings();
  const typed = document.getElementById("opt-scale").value.trim();
  const notes = [];
  if (qr) {
    const { width, height } = qr.canvas;
    if (format === "PDF") {
      const toMm = qr.moduleMm / scale;
      notes.push(tr(`列印尺寸 ${(width * toMm).toFixed(1)} × ${(height * toMm).toFixed(1)} mm`, `Print size ${(width * toMm).toFixed(1)} × ${(height * toMm).toFixed(1)} mm`));
    } else if (format === "SVG") {
      notes.push(tr(`基準尺寸 ${width} × ${height} px，SVG 可任意放大`, `Base size ${width} × ${height} px. SVG scales to any size`));
    } else {
      notes.push(tr(`下載尺寸 ${width} × ${height} px`, `Download size ${width} × ${height} px`));
    }
    const shown = stage.querySelector("canvas, img")?.getBoundingClientRect().width;
    if (shown && shown < width - 1) notes.push(tr("超過預覽區，畫面已縮小顯示", "It's larger than the preview area, so it's shown smaller here"));
  }
  if (typed !== String(scale)) notes.unshift(tr(`已改用 ${scale}，範圍是 2 到 20`, `Using ${scale}, since the range is 2 to 20`));
  hint.textContent = notes.join(tr("。", ". "));
}

function phoneHint(code, number, describe) {
  const full = QRExtras.phoneNumber(code, number);
  if (full === null) return number.trim() ? tr("國碼請輸入 1 到 4 位數字，例如 +886", "Enter a country code of 1 to 4 digits, such as +886") : "";
  const shown = full.replace(/[^+\d*#,;]/g, "");
  return /\d/.test(shown) ? describe(shown) : "";
}

function updatePhoneHints() {
  const type = qiType();
  document.getElementById("qi-phone-hint").textContent = ["phone", "sms"].includes(type)
    ? phoneHint(qiCountryCode.value, document.getElementById("qi-phone").value, number => type === "phone"
      ? tr(`掃描後會撥打 ${number}`, `Scanning it calls ${number}`)
      : tr(`掃描後會傳簡訊給 ${number}`, `Scanning it texts ${number}`))
    : "";
  document.getElementById("qi-contact-hint").textContent = type === "vcard"
    ? phoneHint(qiContactCode.value, document.getElementById("qi-contact-phone").value, number => tr(`聯絡人的電話會存成 ${number}`, `The contact's number is saved as ${number}`))
    : "";
}

function updateTypeFields() {
  const type = qiType();
  const isWifi = type === "wifi";
  const isPhone = ["phone", "sms"].includes(type);
  document.getElementById("qi-data-row").hidden = isWifi || type === "vcard" || isPhone;
  document.getElementById("qi-phone-rows").hidden = !isPhone;
  document.getElementById("qi-wifi-rows").hidden = !isWifi;
  document.getElementById("qi-data-label").textContent = type === "url" ? tr("網址", "Link") : tr("文字內容", "Text");
  document.getElementById("qi-contact-rows").hidden = type !== "vcard";
  document.getElementById("qi-subject-row").hidden = type !== "email";
  document.getElementById("qi-body-row").hidden = !["email", "sms"].includes(type);
  if (type === "email") document.getElementById("qi-data-label").textContent = tr("收件人 Email", "Recipient email");
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
  if (qiType() === "vcard") document.getElementById("qi-contact-family").focus();
  else if (["phone", "sms"].includes(qiType())) document.getElementById("qi-phone").focus();
  else if (qiType() !== "wifi") qiData.focus();
}));

/* The menu and the code field stay in step, so either can be used. */
function wireCountryCode(select, input) {
  select.addEventListener("change", () => {
    input.value = select.value;
    renderQuick();
    if (!select.value) input.focus();
  });
  input.addEventListener("input", () => {
    const code = `+${input.value.trim().replace(/^(\+|00)/, "")}`;
    select.value = Array.from(select.options).some(option => option.value === code) ? code : "";
    scheduleQuick();
  });
}

// Copies keep their data-i18n wording, so they follow the language too.
qiContactCountry.append(...Array.from(qiCountrySelect.options, option => option.cloneNode(true)));
wireCountryCode(qiCountrySelect, qiCountryCode);
wireCountryCode(qiContactCountry, qiContactCode);
document.getElementById("qi-security").addEventListener("change", () => { updateTypeFields(); renderQuick(); });
qiFont.addEventListener("change", renderQuick);
for (const id of ["qi-data", "qi-phone", "qi-ssid", "qi-password", "qi-caption", "qi-subject", "qi-body", ...["family", "given", "nickname", "displayName", "org", "title", "phone", "email", "url"].map(key => `qi-contact-${key}`)]) {
  document.getElementById(id).addEventListener("input", scheduleQuick);
}

qiDownload.addEventListener("click", () => {
  if (!quickQr) return;
  const name = document.getElementById("qi-name").value.trim();
  downloadSingle(name ? sanitizeFilename(name) : qiDefaultName(), quickQr);
});

/* ── Sharing the current QR code ─────────────────────────────────── */
// Share the same styled image shown in the preview.
function quickShareCanvas() {
  return quickQr.canvas;
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
  document.getElementById("qp-sheet").hidden = !quickQr;
  document.getElementById("qp-sheet-note").textContent = "";
  updateShareButtons();
  updateQuickSheet();
}

/* ── A full label sheet of the current QR code ───────────────────── */
const quickSheetSelect = document.getElementById("qp-sheet-layout");
const quickSheetMode = document.getElementById("qp-sheet-mode");
QRPrint.wireLabelSelect(quickSheetSelect);

// Room to leave on each side when following Image size, so a printer shift doesn't clip it.
const LABEL_MARGIN_MM = 1;
const SHEET_MARK = / · (放不下|太小|won't fit|too small)$/;

function markSheet(option, mark) {
  const name = option.textContent.replace(SHEET_MARK, "");
  option.textContent = mark ? `${name} · ${mark}` : name;
}

// Either fills the label, or uses the same true size as a single PDF download.
function quickSheetSize(layout) {
  const { canvas, matrix, moduleMm } = quickQr;
  const mmPerPixel = moduleMm / getSettings().scale;
  // The whole image, with any text below the code, keeps its shape inside each label.
  const widthMm = quickSheetMode.value === "actual"
    ? canvas.width * mmPerPixel
    : Math.min(layout.label[0] - 4, (layout.label[1] - 4) * canvas.width / canvas.height);
  const heightMm = widthMm * canvas.height / canvas.width;
  const spareWidth = layout.label[0] - widthMm;
  const spareHeight = layout.label[1] - heightMm;
  const small = widthMm / (matrix.size + 8) < MIN_LABEL_MODULE_MM;
  const state = spareWidth < 0 || spareHeight < 0 ? "over"
    : small ? "small"
    : quickSheetMode.value === "actual" && Math.min(spareWidth, spareHeight) < LABEL_MARGIN_MM * 2 ? "tight"
    : "ok";
  return { widthMm, heightMm, spareWidth, spareHeight, state };
}

function updateQuickSheet() {
  if (!quickQr) return;
  let best = null;
  for (const option of quickSheetSelect.options) {
    const layout = QRPrint.LABEL_LAYOUTS[option.value];
    const { state } = quickSheetSize(layout);
    markSheet(option, state === "over" ? tr("放不下", "won't fit") : state === "small" ? tr("太小", "too small") : "");
    const area = layout.label[0] * layout.label[1];
    if (state === "ok" && (!best || area < best.area)) best = { key: option.value, area, name: option.textContent };
  }
  const layout = QRPrint.LABEL_LAYOUTS[quickSheetSelect.value];
  const fit = quickSheetSize(layout);
  const size = `${fit.widthMm.toFixed(1)} × ${fit.heightMm.toFixed(1)}`;
  const label = `${layout.label[0]} × ${layout.label[1]}`;
  const box = document.getElementById("qp-sheet-fit");
  box.className = `fit-status ${fit.state}`;
  if (fit.state === "over") {
    const parts = [];
    if (fit.spareWidth < 0) parts.push(tr(`寬了 ${(-fit.spareWidth).toFixed(1)} mm`, `${(-fit.spareWidth).toFixed(1)} mm too wide`));
    if (fit.spareHeight < 0) parts.push(tr(`高了 ${(-fit.spareHeight).toFixed(1)} mm`, `${(-fit.spareHeight).toFixed(1)} mm too tall`));
    box.textContent = tr(`✗ 放不下：QR Code ${size} mm，標籤 ${label} mm，${parts.join("、")}`, `✗ Won't fit: the QR code is ${size} mm and the label ${label} mm, so it's ${parts.join(" and ")}`);
  } else if (fit.state === "small") {
    box.textContent = tr(`⚠ 太小：每張 ${size} mm，可能難以掃描。請改用較大的標籤或縮短內容`, `⚠ Too small: ${size} mm each, which may be hard to scan. Use a larger label or shorter content`);
  } else if (fit.state === "tight") {
    box.textContent = tr(`⚠ 放得下但幾乎貼邊：QR Code ${size} mm，標籤 ${label} mm`, `⚠ Fits, but only just: the QR code is ${size} mm and the label ${label} mm`);
  } else {
    box.textContent = tr(`✓ 每張印出 ${size} mm，標籤 ${label} mm`, `✓ Prints at ${size} mm on a ${label} mm label`);
  }
  const actual = quickSheetMode.value === "actual";
  document.getElementById("qp-sheet-btn").disabled = fit.state === "over";
  document.getElementById("qp-sheet-actions").hidden = fit.state === "ok";
  document.getElementById("qp-sheet-adjust").hidden = !actual;
  const switchButton = document.getElementById("qp-sheet-switch");
  switchButton.hidden = !best;
  if (best) {
    switchButton.textContent = tr(`改用 ${best.name}`, `Use ${best.name}`);
    switchButton.dataset.key = best.key;
  }
}

quickSheetSelect.addEventListener("change", () => {
  document.getElementById("qp-sheet-note").textContent = "";
  updateQuickSheet();
});
quickSheetMode.addEventListener("change", () => {
  document.getElementById("qp-sheet-note").textContent = "";
  updateQuickSheet();
});
document.getElementById("qp-sheet-switch").addEventListener("click", (event) => {
  quickSheetSelect.value = event.currentTarget.dataset.key;
  updateQuickSheet();
  quickSheetSelect.focus();
});
document.getElementById("qp-sheet-adjust").addEventListener("click", () => {
  const layout = QRPrint.LABEL_LAYOUTS[quickSheetSelect.value];
  const { canvas, moduleMm } = quickQr;
  const { scale } = getSettings();
  // Width and height in mm both grow in step with Image size.
  const mmPerStep = (pixels) => pixels * (moduleMm / scale) / scale;
  const room = LABEL_MARGIN_MM * 2;
  const largest = Math.floor(Math.min((layout.label[0] - room) / mmPerStep(canvas.width), (layout.label[1] - room) / mmPerStep(canvas.height)));
  if (largest < 2) {
    document.getElementById("qp-sheet-note").textContent = tr(
      "這張標籤太小，圖片大小設為最小的 2 仍放不下。請改用「自動符合標籤」或較大的標籤。",
      "This label is too small, even at the smallest Image size of 2. Use Fit each label or a larger label.",
    );
    return;
  }
  const scaleInput = document.getElementById("opt-scale");
  const before = scaleInput.value;
  scaleInput.value = Math.min(20, largest);
  renderQuick();
  if (results.length && lastBatchRun) lastBatchRun();
  document.getElementById("qp-sheet-note").textContent = tr(
    `已將圖片大小從 ${before} 改為 ${scaleInput.value}，下載的圖片也會跟著改變。`,
    `Image size changed from ${before} to ${scaleInput.value}, which also changes downloaded images.`,
  );
});

document.getElementById("qp-sheet-btn").addEventListener("click", () => {
  if (!quickQr) return;
  const key = quickSheetSelect.value;
  const layout = QRPrint.LABEL_LAYOUTS[key];
  const { canvas } = quickQr;
  const { widthMm, heightMm, state } = quickSheetSize(layout);
  if (state === "over") return;
  const vector = QRExtras.vector(canvas);
  const bytes = QRPrint.labelSheet(key, layout.cols * layout.rows, (cell, pageHeight) => QRPrint.vectorOps(
    vector,
    cell.x + (cell.width - widthMm) / 2,
    cell.y + (cell.height - heightMm) / 2,
    widthMm / canvas.width,
    pageHeight,
  ));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${quickFilename()}-${key}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

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

/* ── Colors ──────────────────────────────────────────────────────── */
const foregroundInput = document.getElementById("opt-foreground");
const backgroundInput = document.getElementById("opt-background");

function luminance(hex) {
  const channel = (start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

// Dark codes on light backgrounds, so every pairing here scans.
const COLOR_SWATCHES = [
  { input: foregroundInput, light: false, colors: [
    ["#000000", "黑", "Black"], ["#1E3A8A", "深藍", "Navy"], ["#2563EB", "藍", "Blue"], ["#166534", "綠", "Green"],
    ["#B91C1C", "紅", "Red"], ["#6D28D9", "紫", "Purple"], ["#78350F", "棕", "Brown"],
  ] },
  { input: backgroundInput, light: true, colors: [
    ["#FFFFFF", "白", "White"], ["#FFF7E6", "米", "Cream"], ["#F1F5F9", "淺灰", "Light gray"], ["#EFF6FF", "淺藍", "Light blue"],
    ["#F0FDF4", "淺綠", "Light green"], ["#FEFCE8", "淺黃", "Light yellow"], ["#FFF1F2", "淺粉", "Light pink"],
  ] },
];

for (const group of COLOR_SWATCHES) {
  const custom = group.input.closest(".swatch-custom");
  group.custom = custom;
  group.buttons = group.colors.map(([hex, zh, en]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = group.light ? "swatch is-light" : "swatch";
    button.style.background = hex;
    button.dataset.color = hex;
    button.dataset.zh = zh;
    button.dataset.en = en;
    button.addEventListener("click", () => {
      group.input.value = hex.toLowerCase();
      // The same event a picked color sends, so the code redraws the same way.
      group.input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    custom.before(button);
    return button;
  });
}

function updateColorDetails() {
  document.getElementById("opt-foreground-hex").textContent = foregroundInput.value.toUpperCase();
  document.getElementById("opt-background-hex").textContent = backgroundInput.value.toUpperCase();
  for (const group of COLOR_SWATCHES) {
    const current = group.input.value.toUpperCase();
    for (const button of group.buttons) {
      const name = tr(button.dataset.zh, button.dataset.en);
      button.title = name;
      button.setAttribute("aria-label", name);
      button.setAttribute("aria-pressed", String(button.dataset.color === current));
    }
    const custom = !group.buttons.some(button => button.dataset.color === current);
    group.custom.classList.toggle("is-active", custom);
    group.custom.style.background = custom ? current : "";
    group.custom.title = tr("自訂顏色", "Custom color");
  }
  const code = luminance(foregroundInput.value);
  const back = luminance(backgroundInput.value);
  const contrast = (Math.max(code, back) + 0.05) / (Math.min(code, back) + 0.05);
  const warning = document.getElementById("color-warning");
  warning.textContent = contrast < 3
    ? tr("對比太低，可能掃不出來。請加深圖案或淡化背景。", "The contrast is too low to scan reliably. Darken the code or lighten the background.")
    : code > back
      ? tr("淺色圖案配深色背景，部分掃描器可能讀不到。", "Some scanners can't read a light code on a dark background.")
      : "";
  warning.hidden = !warning.textContent;
}

settingsNode.addEventListener("input", updateColorDetails);
document.addEventListener("qrlangchange", updateColorDetails);
updateColorDetails();

/* ── Logo ────────────────────────────────────────────────────────── */
const logoInput = document.getElementById("opt-logo");
const logoStatus = document.getElementById("logo-status");
const eclSelect = document.getElementById("opt-ecl");
let logoRun = 0;
let logoPreviewUrl = "";
let eclBeforeLogo = "";

// A logo always uses level H, so the menu says so and the earlier choice returns with its removal.
function showLogo(file) {
  document.getElementById("logo-pick").hidden = Boolean(file);
  document.getElementById("logo-chosen").hidden = !file;
  document.getElementById("logo-hint").hidden = !file;
  document.getElementById("logo-size-row").hidden = !file;
  URL.revokeObjectURL(logoPreviewUrl);
  logoPreviewUrl = file ? URL.createObjectURL(file) : "";
  document.getElementById("logo-preview").src = logoPreviewUrl;
  document.getElementById("logo-name").textContent = file ? file.name : "";
  if (file && !eclSelect.disabled) eclBeforeLogo = eclSelect.value;
  if (!file && eclSelect.disabled) eclSelect.value = eclBeforeLogo;
  if (file) eclSelect.value = "H";
  eclSelect.disabled = Boolean(file);
}

// Tested up to this limit: beyond 28% of the code's width, short links stop scanning.
const logoSizeInput = document.getElementById("opt-logo-size");
function updateLogoSize() {
  document.getElementById("logo-size-value").textContent = `${logoSizeInput.value}%`;
}
logoSizeInput.addEventListener("input", updateLogoSize);
updateLogoSize();

function rebuildAfterLogo() {
  renderQuick();
  if (results.length && lastBatchRun) lastBatchRun();
}

logoInput.addEventListener("change", async () => {
  const file = logoInput.files[0];
  if (!file) return;
  const run = ++logoRun;
  try {
    await QRExtras.setLogo(file);
    if (run !== logoRun) return;
    logoStatus.textContent = "";
    showLogo(file);
    rebuildAfterLogo();
  } catch (err) {
    if (run === logoRun) logoStatus.textContent = err.message;
  } finally {
    // Lets the same file be chosen again.
    logoInput.value = "";
  }
});
document.getElementById("logo-clear").addEventListener("click", async () => {
  ++logoRun;
  await QRExtras.setLogo(null);
  logoStatus.textContent = "";
  showLogo(null);
  rebuildAfterLogo();
  logoInput.focus();
});

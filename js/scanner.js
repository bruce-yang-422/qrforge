/* ===================================================================
   Scan (camera, photo, screenshot) and Check (grade, contrast, damage
   map) tabs. Images stay in the browser.
   =================================================================== */
(() => {
  const MAX_SIDE = 2000;
  const SVG_SIDE = 1500;
  const $ = (id) => document.getElementById(id);

  const JSQR = () => QRTabs.loadScript("libs/jsQR.js");
  const ZXING = () => QRTabs.loadScript("libs/zxing.min.js");

  function readBarcode(image) {
    if (!window.ZXing) return null;
    const width = image.width + 40, height = image.height + 40;
    const gray = new Uint8ClampedArray(width * height).fill(255);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      gray[(y + 20) * width + x + 20] = (image.data[i] * 306 + image.data[i+1] * 601 + image.data[i+2] * 117) >> 10;
    }
    const hints = new Map([[ZXing.DecodeHintType.TRY_HARDER, true]]);
    const reader = new ZXing.MultiFormatReader();
    for (let turn = 0; turn < 2; turn++) {
      let pixels = gray;
      if (turn) {
        pixels = new Uint8ClampedArray(gray.length);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[x * height + height - 1 - y] = gray[y * width + x];
      }
      try {
        const source = new ZXing.RGBLuminanceSource(pixels, turn ? height : width, turn ? width : height);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
        const result = reader.decode(bitmap, hints);
        const format = ZXing.BarcodeFormat[result.getBarcodeFormat()];
        return { text: result.getText(), info: { kind: format === "QR_CODE" ? "QR Code" : tr("條碼", "Barcode"), detail: format } };
      } catch { /* No readable barcode in this frame is normal. */ }
      finally { reader.reset(); }
    }
    return null;
  }

  /* Draws any image source to a canvas, optionally scaled. */
  function toImageData(source, width, height, scale) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /* Tiny codes need upscaling and noisy photos decode better when reduced. */
  async function decodeBitmap(bitmap) {
    await JSQR();
    const longest = Math.max(bitmap.width, bitmap.height);
    const base = Math.min(1, MAX_SIDE / longest);
    const scales = [base, base / 2, base / 4];
    if (longest < 500) scales.unshift(3, 2);
    for (const scale of scales) {
      const image = toImageData(bitmap, bitmap.width, bitmap.height, scale);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
      if (code) return { code, image };
    }
    return { code: null, image: toImageData(bitmap, bitmap.width, bitmap.height, base) };
  }

  /* Every code in the image, on the same image a single-code pass settled on. */
  async function decodeAll(bitmap) {
    const { code, image } = await decodeBitmap(bitmap);
    return { codes: await QRMulti.findCodes(image, code), image };
  }

  /* createImageBitmap can't open SVG, so draw it large enough to keep modules sharp.
     As an <img> source, any script inside it never runs. */
  async function readSvg(file) {
    const url = URL.createObjectURL(new Blob([file], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = longest ? SVG_SIDE / longest : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale) || SVG_SIDE;
      canvas.height = Math.round(image.naturalHeight * scale) || SVG_SIDE;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await createImageBitmap(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function readFile(file) {
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (!isSvg && !file.type.startsWith("image/")) throw new Error(tr("請選擇圖片檔", "Please choose an image file"));
    try {
      return await (isSvg ? readSvg(file) : createImageBitmap(file));
    } catch {
      throw new Error(tr("這個檔案無法開啟，可能已損毀", "This file couldn't be opened. It may be damaged"));
    }
  }

  /* Wires a drop zone to its hidden file input. */
  function wireDropZone(zone, input, onFile) {
    zone.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    input.addEventListener("change", () => {
      if (input.files.length) onFile(input.files[0]);
      input.value = "";
    });
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
    });
  }

  /* ── Scan ──────────────────────────────────────────────────────── */
  const video = $("scan-video");
  const overlay = $("scan-overlay");
  const overlayHint = $("scan-overlay-hint");
  const scanStatus = $("scan-status");
  const scanResults = $("scan-results");
  const toDetect = $("scan-to-detect");
  const liveBox = $("scan-live");
  const resultsHome = scanResults.parentElement;
  const seen = new Map();
  let lastRead = null;
  let stream = null;
  let timer = null;
  let cameraSession = 0;
  let cameraOpening = false;
  let lastFailedFile = null;
  let scanRun = 0;

  function describe(text) {
    if (/^WIFI:/i.test(text)) {
      const ssid = /[:;]S:((?:\\.|[^;])*)/i.exec(text);
      return { kind: "WiFi", detail: ssid ? `${tr("網路名稱", "Network")}: ${ssid[1].replace(/\\(.)/g, "$1")}` : "" };
    }
    if (/^https?:\/\//i.test(text)) return { kind: tr("網址", "Link"), href: text };
    if (/^BEGIN:VCARD/i.test(text)) return { kind: tr("聯絡人", "Contact") };
    if (/^mailto:/i.test(text)) return describeEmail(text);
    if (/^tel:/i.test(text)) return describePhone(text);
    if (/^sms(?:to)?:/i.test(text)) return describeSms(text);
    return { kind: tr("文字", "Text") };
  }

  const readable = (value) => {
    try { return decodeURIComponent(value); } catch { return value; }
  };
  const namedParts = (parts) => parts.filter(([, value]) => value).map(([name, value]) => `${name}: ${value}`).join("\n");

  function describeEmail(text) {
    const [recipient, query = ""] = text.slice(7).split(/\?(.*)/s);
    const fields = new URLSearchParams(query.replace(/\+/g, "%2B"));
    const detail = namedParts([
      [tr("收件人", "To"), readable(recipient)],
      [tr("主旨", "Subject"), fields.get("subject")],
      [tr("內文", "Body"), fields.get("body")],
    ]);
    return { kind: "Email", detail, ...(detail && { href: text, action: tr("寄信", "Send email") }) };
  }

  function describePhone(text) {
    const number = readable(text.slice(4)).trim();
    return { kind: tr("電話", "Phone"), ...(/\d/.test(number) && { href: text, action: tr("撥打", "Call") }) };
  }

  /* SMSTO:number:message is an older form many generators still write. */
  function describeSms(text) {
    const old = /^smsto:([^:]*):?(.*)$/is.exec(text);
    const [number, body] = old ? [old[1], old[2]] : (() => {
      const [to, query = ""] = text.slice(4).split(/[?&](.*)/s);
      return [readable(to), new URLSearchParams(query.replace(/\+/g, "%2B")).get("body") || ""];
    })();
    const href = old ? `sms:${encodeURI(number)}?body=${encodeURIComponent(body)}` : text;
    const detail = namedParts([[tr("內文", "Body"), body]]);
    return { kind: tr("簡訊", "SMS"), detail, ...(/\d/.test(number) && { href, action: tr("傳簡訊", "Send text") }) };
  }

  /* jsQR only understands UTF-8 and returns "" for anything else, so try older
     encodings. What still isn't text is shown as bytes rather than as "not found". */
  function readCode(code) {
    if (!code) return null;
    if (code.data) return { text: code.data };
    const bytes = Uint8Array.from(code.binaryData);
    if (!bytes.length) return null;
    for (const encoding of ["big5", "gb18030", "shift_jis"]) {
      try {
        const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
        if (!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return { text };
      } catch { /* Not this encoding. */ }
    }
    const pieces = (String.fromCharCode(...bytes).match(/[A-Za-z0-9][\x20-\x7e]{2,}/g) || []).map((piece) => piece.trim()).join(", ");
    const size = tr(`${bytes.length} 位元組，不是一般文字`, `${bytes.length} bytes that aren't plain text`);
    return {
      text: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" "),
      info: {
        kind: tr("二進位資料", "Binary data"),
        detail: pieces ? tr(`${size}。看得出的片段：${pieces}`, `${size}. Readable parts: ${pieces}`) : size,
      },
    };
  }

  /* Returns the row, moving it to the top if this text was already read. */
  function addScanResult({ text, info = describe(text) }) {
    if (seen.has(text)) {
      scanResults.prepend(seen.get(text));
      return seen.get(text);
    }

    const row = document.createElement("div");
    row.className = "scan-row";
    const kind = document.createElement("span");
    kind.className = "scan-kind";
    kind.textContent = info.kind;
    const value = document.createElement("div");
    value.className = "scan-value";
    value.textContent = text;
    row.append(kind, value);
    if (info.detail) {
      const detail = document.createElement("div");
      detail.className = "scan-detail";
      detail.textContent = info.detail;
      row.append(detail);
    }

    const actions = document.createElement("div");
    actions.className = "scan-actions";
    /* Links are never opened automatically: a QR code is untrusted input. */
    if (info.href) {
      const open = document.createElement("a");
      open.className = "btn btn-primary btn-sm";
      open.href = info.href;
      /* Email, phone and SMS addresses hand over to another app, so no blank tab is left behind. */
      if (!info.action) {
        open.target = "_blank";
        open.rel = "noopener noreferrer";
      }
      open.textContent = info.action || tr("開啟連結", "Open link");
      actions.append(open);
    }
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn btn-secondary btn-sm";
    copy.textContent = tr("複製", "Copy");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = tr("已複製", "Copied");
      } catch {
        copy.textContent = tr("無法複製", "Couldn't copy");
      }
    });
    actions.append(copy);
    row.append(actions);
    seen.set(text, row);
    scanResults.prepend(row);
    return row;
  }

  /* Each camera start gets a number, so a close during the permission prompt wins. */
  function stopCamera() {
    cameraSession++;
    clearTimeout(timer);
    timer = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove("camera-open");
    resultsHome.append(scanResults);
    $("scan-camera-btn").focus();
    /* Drop the history entry added on opening, unless Back already removed it. */
    if (history.state && history.state.qrCamera) history.back();
    if (lastRead !== null) scanResults.scrollIntoView({ block: "center" });
  }

  /* The camera reads the same code many times a second, so react only to a change. */
  function showCameraRead(result) {
    if (result.text === lastRead) return;
    lastRead = result.text;
    const row = addScanResult(result);
    row.classList.remove("just-read");
    void row.offsetWidth;
    row.classList.add("just-read");
    liveBox.scrollTop = 0;
    if (navigator.vibrate) navigator.vibrate(100);
  }

  function scanFrame() {
    if (!stream) return;
    if (video.videoWidth) {
      const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
      const image = toImageData(video, video.videoWidth, video.videoHeight, scale);
      const result = readCode(jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })) || readBarcode(image);
      if (result) showCameraRead(result);
    }
    timer = setTimeout(scanFrame, 200);
  }

  async function startCamera() {
    toDetect.hidden = true;
    scanStatus.textContent = "";
    if (!navigator.mediaDevices || !window.isSecureContext) {
      scanStatus.textContent = tr("這個網址無法使用相機，請改用 HTTPS 開啟，或選擇圖片", "The camera needs HTTPS. Open the app over HTTPS, or choose an image");
      return;
    }
    const session = ++cameraSession;
    lastRead = null;
    liveBox.prepend(scanResults);
    overlay.hidden = false;
    document.body.classList.add("camera-open");
    history.pushState({ qrCamera: true }, "");
    overlayHint.textContent = tr("正在開啟相機…", "Starting the camera…");
    $("scan-close").focus();
    try {
      /* Ask right away, while the tap still counts as the reason for the prompt. */
      const library = Promise.all([JSQR(), ZXING()]);
      cameraOpening = true;
      const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      cameraOpening = false;
      if (session !== cameraSession) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = opened;
      video.srcObject = stream;
      await library;
      if (session !== cameraSession) return;
      overlayHint.textContent = tr("將 QR Code 或條碼對準框內", "Point the camera at a QR code or barcode");
      /* Some browsers only start the picture after a tap on it. */
      video.play().catch(() => {
        overlayHint.textContent = tr("輕觸畫面開始", "Tap the screen to start");
      });
      scanFrame();
    } catch (err) {
      cameraOpening = false;
      if (session !== cameraSession) return;
      stopCamera();
      scanStatus.textContent = err.name === "NotAllowedError"
        ? tr("相機權限被拒絕，可在瀏覽器設定中允許，或改選圖片", "Camera access was denied. Allow it in your browser settings, or choose an image")
        : tr(`無法開啟相機（${err.name}），可以改選圖片`, `Couldn't start the camera (${err.name}). Try choosing an image`);
    }
  }

  $("scan-camera-btn").addEventListener("click", startCamera);
  $("scan-close").addEventListener("click", stopCamera);
  video.addEventListener("click", () => {
    video.play().then(() => { overlayHint.textContent = tr("將 QR Code 或條碼對準框內", "Point the camera at a QR code or barcode"); }).catch(() => {});
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") stopCamera(); });
  /* On phones, Back should close the camera rather than leave the site. */
  window.addEventListener("popstate", stopCamera);

  async function scanImage(file) {
    const run = ++scanRun;
    scanStatus.textContent = tr("讀取中…", "Reading…");
    toDetect.hidden = true;
    try {
      await ZXING();
      const bitmap = await readFile(file);
      let codes, barcode;
      try {
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        barcode = readBarcode(toImageData(bitmap, bitmap.width, bitmap.height, scale));
        ({ codes } = await decodeAll(bitmap));
      } finally { bitmap.close(); }
      if (run !== scanRun) return;
      const read = codes.map(readCode).filter(Boolean);
      if (barcode && !read.some(result => result.text === barcode.text)) read.push(barcode);
      /* Added last to first, because each new row goes on top. */
      for (const result of [...read].reverse()) addScanResult(result);
      if (run !== scanRun) return;
      if (read.length) {
        scanStatus.textContent = read.length > 1
          ? tr(`這張圖片讀到 ${read.length} 個不同的 QR Code 或條碼`, `Found ${read.length} different QR codes or barcodes in this image`)
          : "";
      } else {
        lastFailedFile = file;
        scanStatus.textContent = tr("這張圖片讀不到 QR Code 或條碼", "No QR code or barcode could be read from this image");
        toDetect.hidden = false;
      }
    } catch (err) {
      if (run === scanRun) scanStatus.textContent = err.message;
    }
  }

  wireDropZone($("scan-drop"), $("scan-file"), scanImage);
  document.addEventListener("qrsharedfiles", async (event) => {
    QRTabs.select("scan");
    for (const file of event.detail) await scanImage(file);
  });

  toDetect.addEventListener("click", () => {
    QRTabs.select("detect");
    if (lastFailedFile) detectImage(lastFailedFile);
  });

  /* ── Check ─────────────────────────────────────────────────────── */
  const report = $("detect-report");
  let detectRun = 0;

  const verdictText = (grade) => ({
    A: tr("可以順利掃描", "Scans reliably"),
    B: tr("可以掃描，品質良好", "Scans well"),
    C: tr("大多可以掃描，但有風險", "Usually scans, with some risk"),
    D: tr("部分手機可能掃不出來", "Some phones may not scan it"),
    F: tr("很可能掃不出來", "Likely won't scan"),
  })[grade];

  function statRow(label, value, grade) {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = label;
    const cell = document.createElement("td");
    cell.textContent = value;
    const badge = document.createElement("td");
    if (grade) {
      badge.textContent = grade;
      badge.className = `grade-chip grade-${grade}`;
    }
    row.append(name, cell, badge);
    return row;
  }

  function verdict(grade, title, subtitle) {
    const box = document.createElement("div");
    box.className = "detect-verdict";
    const letter = document.createElement("div");
    letter.className = `detect-grade grade-${grade}`;
    letter.textContent = grade;
    const text = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = title;
    const sub = document.createElement("span");
    sub.className = "hint";
    sub.textContent = subtitle;
    text.append(heading, sub);
    box.append(letter, text);
    return box;
  }

  function tipList(tips) {
    const list = document.createElement("ul");
    list.className = "detect-tips";
    for (const tip of tips) {
      const li = document.createElement("li");
      li.textContent = tip;
      list.append(li);
    }
    return list;
  }

  /* Draws the symbol as sampled, with damaged modules marked in colour. */
  function damageMap(sample, analysis) {
    const CELL = Math.max(4, Math.min(10, Math.floor(320 / (analysis.size + 2))));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = (analysis.size + 2) * CELL;
    canvas.className = "detect-map";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", tr("損傷圖", "Damage map"));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < analysis.size; y++) {
      for (let x = 0; x < analysis.size; x++) {
        const mark = analysis.damage[y][x];
        ctx.fillStyle = mark === 1 ? "#dc2626" : mark === 2 ? "#f59e0b" : sample.modules[y][x] ? "#0f172a" : "#fff";
        ctx.fillRect((x + 1) * CELL, (y + 1) * CELL, CELL, CELL);
      }
    }
    return canvas;
  }

  /* Without a location, contrast can only be estimated from the whole image. */
  function imageContrast(image) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < image.data.length; i += 4) {
      hist[Math.round(0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2])]++;
    }
    const total = image.width * image.height;
    const percentile = (p) => {
      let seenCount = 0;
      for (let v = 0; v < 256; v++) { seenCount += hist[v]; if (seenCount >= total * p) return v; }
      return 255;
    };
    const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return (lin(percentile(0.95)) + 0.05) / (lin(percentile(0.05)) + 0.05);
  }

  function showFailure(image) {
    const contrast = imageContrast(image);
    const tips = [
      tr("確認整個 QR Code 都在圖片內，三個角落的方塊要清楚", "Make sure the whole code is in the image, including the three corner squares"),
      tr("避免模糊、反光與過度傾斜", "Avoid blur, glare, and steep angles"),
    ];
    if (contrast < 3) tips.push(tr("圖片對比太低，請加深圖案或淡化背景", "Contrast is too low. Darken the code or lighten the background"));
    report.replaceChildren(verdict("F", tr("找不到可讀取的 QR Code", "No readable QR code found"), tr("可以試試這些方法：", "Try these fixes:")), tipList(tips));
  }

  /* Plain-language advice for whatever lowered the grade. */
  function adviceFor(sample, grades) {
    const tips = [];
    if (grades.contrast !== "A") tips.push(tr("對比偏低：加深圖案顏色，或使用較淺的背景", "Low contrast: use a darker code or a lighter background"));
    if (grades.quiet !== "A") tips.push(tr("周圍留白不足：在 QR Code 四周多留一些空白", "Tight margins: leave more blank space around the code"));
    if (grades.damage !== "A") tips.push(tr("圖案有損傷：請更換圖片，或提高防損傷程度後重新產生", "Damage found: use a cleaner image, or recreate the code with more damage protection"));
    if (sample.inverted) tips.push(tr("淺色圖案配深色背景：部分掃描器讀不到，建議改為深色圖案", "Light code on a dark background: some scanners can't read this, so a dark code is safer"));
    return tips;
  }

  function reportNodes(code, image) {
    const sample = QRAnalyze.sampleSymbol(image, code.location, code.version);
    const analysis = QRAnalyze.analyzeMatrix(sample.modules);
    const grades = QRAnalyze.grade({ ...sample, ...analysis });
    const used = Math.round(analysis.capacityUsed * 100);

    const body = document.createElement("tbody");
    body.append(
      statRow(tr("內容", "Content"), code.data || tr(`${code.binaryData.length} 位元組的資料`, `${code.binaryData.length} bytes of data`)),
      statRow(tr("對比", "Contrast"), `${sample.contrast.toFixed(1)}:1`, grades.contrast),
      statRow(tr("周圍留白", "Margin"), tr(`${sample.quietZone >= 4 ? "足夠" : `${sample.quietZone} 格，建議 4 格`}`, `${sample.quietZone >= 4 ? "Enough" : `${sample.quietZone} of 4 recommended`}`), grades.quiet),
      statRow(tr("損傷", "Damage"), analysis.erroredCodewords || analysis.functionErrors || analysis.uncorrectable
        ? tr(`已用掉 ${used}% 的修復能力`, `${used}% of repair capacity used`)
        : tr("沒有發現損傷", "None found"), grades.damage),
    );
    const table = document.createElement("table");
    table.className = "detect-table";
    table.append(body);

    const techBody = document.createElement("tbody");
    techBody.append(
      statRow(tr("版本", "Version"), `${analysis.version} (${analysis.size} × ${analysis.size})`),
      statRow(tr("容錯等級", "Error correction"), analysis.level),
      statRow(tr("遮罩", "Mask"), String(analysis.mask)),
      statRow(tr("錯誤碼字", "Codeword errors"), `${analysis.erroredCodewords} / ${analysis.totalCodewords}`),
    );
    const techTable = document.createElement("table");
    techTable.className = "detect-table";
    techTable.append(techBody);
    const tech = document.createElement("details");
    tech.className = "more";
    const techSummary = document.createElement("summary");
    techSummary.textContent = tr("技術資訊", "Technical details");
    tech.append(techSummary, techTable);

    const side = document.createElement("div");
    side.className = "detect-side";
    side.append(table, tech);

    const figure = document.createElement("figure");
    figure.className = "detect-figure";
    const caption = document.createElement("figcaption");
    const keyData = document.createElement("span");
    keyData.className = "key key-data";
    const keyFunction = document.createElement("span");
    keyFunction.className = "key key-function";
    caption.append(keyData, tr("內容損傷", "Content damage"), keyFunction, tr("定位區損傷", "Corner or format damage"));
    figure.append(damageMap(sample, analysis), caption);

    const layout = document.createElement("div");
    layout.className = "detect-layout";
    layout.append(side, figure);

    const note = document.createElement("p");
    note.className = "detect-note";
    note.textContent = tr(
      "評等是依圖片估算，不是 ISO/IEC 15415 正式驗證。大量印刷前請先實際印一張測試。",
      "Grades are estimates from the image, not an ISO/IEC 15415 verification. Test a printed sample before a large print run.",
    );

    const tips = adviceFor(sample, grades);
    const nodes = [verdict(grades.overall, verdictText(grades.overall), tips.length ? tr("可以這樣改善：", "How to improve it:") : tr("沒有發現問題。", "No problems found."))];
    if (tips.length) nodes.push(tipList(tips));
    nodes.push(layout, note);
    return nodes;
  }

  function showReports(codes, image) {
    if (codes.length === 1) {
      report.replaceChildren(...reportNodes(codes[0], image));
      return;
    }
    report.replaceChildren(...codes.map((code, index) => {
      const section = document.createElement("section");
      section.className = "detect-item";
      const heading = document.createElement("h3");
      heading.textContent = tr(`第 ${index + 1} 個 QR Code，共 ${codes.length} 個`, `QR code ${index + 1} of ${codes.length}`);
      section.append(heading, ...reportNodes(code, image));
      return section;
    }));
  }

  async function detectImage(file) {
    const run = ++detectRun;
    report.textContent = tr("檢測中…", "Checking…");
    try {
      const { codes, image } = await decodeAll(await readFile(file));
      if (run !== detectRun) return;
      if (codes.length) showReports(codes, image);
      else showFailure(image);
    } catch (err) {
      if (run === detectRun) report.textContent = err.message;
    }
  }

  wireDropZone($("detect-drop"), $("detect-file"), detectImage);

  /* ── Shared ────────────────────────────────────────────────────── */
  document.addEventListener("paste", (e) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    if (QRTabs.current() === "scan") scanImage(file);
    else if (QRTabs.current() === "detect") detectImage(file);
  });

  /* Release the camera as soon as it isn't on screen. */
  document.addEventListener("qrtabchange", stopCamera);
  /* Android hides the page while its own permission dialog is up, so wait that out. */
  document.addEventListener("visibilitychange", () => { if (document.hidden && !cameraOpening) stopCamera(); });
})();

/* ===================================================================
   QR scanner (camera, photo, screenshot) and QR detector (grade,
   contrast, damage map). Images stay in the browser.
   =================================================================== */
(() => {
  const MAX_SIDE = 2000;
  const $ = (id) => document.getElementById(id);

  const JSQR = () => QRTabs.loadScript("libs/jsQR.js");

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

  async function readFile(file) {
    if (!file.type.startsWith("image/")) throw new Error("請選擇圖片檔 / please choose an image file");
    return createImageBitmap(file);
  }

  /* Wires a drop zone to its hidden file input. */
  function wireDropZone(zone, input, onFile) {
    zone.addEventListener("click", () => input.click());
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

  /* ── Scanner ───────────────────────────────────────────────────── */
  const video = $("scan-video");
  const cameraBtn = $("scan-camera-btn");
  const scanStatus = $("scan-status");
  const scanResults = $("scan-results");
  const seen = new Set();
  let stream = null;
  let timer = null;

  function describe(text) {
    if (/^WIFI:/i.test(text)) {
      const ssid = /[:;]S:((?:\\.|[^;])*)/i.exec(text);
      return { kind: "WiFi", detail: ssid ? `SSID: ${ssid[1]}` : "" };
    }
    if (/^https?:\/\//i.test(text)) return { kind: "URL", href: text };
    if (/^BEGIN:VCARD/i.test(text)) return { kind: "vCard" };
    if (/^mailto:/i.test(text)) return { kind: "Email" };
    if (/^tel:/i.test(text)) return { kind: "Phone" };
    return { kind: "Text" };
  }

  function addScanResult(text) {
    if (seen.has(text)) return;
    seen.add(text);
    const info = describe(text);

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
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn btn-secondary btn-sm";
    copy.textContent = "複製 / Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "已複製 / Copied";
      } catch {
        copy.textContent = "無法複製 / Copy failed";
      }
    });
    actions.append(copy);
    /* Links are never opened automatically: a QR code is untrusted input. */
    if (info.href) {
      const open = document.createElement("a");
      open.className = "btn btn-primary btn-sm";
      open.href = info.href;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "開啟連結 / Open link";
      actions.append(open);
    }
    row.append(actions);
    scanResults.prepend(row);
  }

  function stopCamera() {
    clearTimeout(timer);
    timer = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    cameraBtn.textContent = "開啟相機 / Start Camera";
  }

  function scanFrame() {
    if (!stream) return;
    if (video.videoWidth) {
      const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
      const image = toImageData(video, video.videoWidth, video.videoHeight, scale);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
      if (code && code.data) addScanResult(code.data);
    }
    timer = setTimeout(scanFrame, 200);
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !window.isSecureContext) {
      scanStatus.textContent = "相機需要 HTTPS 或 localhost / The camera requires HTTPS or localhost";
      return;
    }
    try {
      await JSQR();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      cameraBtn.textContent = "關閉相機 / Stop Camera";
      scanStatus.textContent = "將 QR Code 對準相機 / Point the camera at a QR code";
      scanFrame();
    } catch (err) {
      stopCamera();
      scanStatus.textContent = err.name === "NotAllowedError"
        ? "相機權限被拒絕 / Camera permission was denied"
        : `無法開啟相機 / Could not start the camera: ${err.message}`;
    }
  }

  cameraBtn.addEventListener("click", () => (stream ? stopCamera() : startCamera()));

  async function scanImage(file) {
    scanStatus.textContent = "掃描中 / Scanning…";
    try {
      const { code } = await decodeBitmap(await readFile(file));
      if (code && code.data) {
        seen.delete(code.data);
        addScanResult(code.data);
        scanStatus.textContent = "掃描成功 / Scan succeeded";
      } else {
        scanStatus.textContent = "找不到 QR Code,可以用偵測器檢查原因 / No QR code found. Try the Detector to see why";
      }
    } catch (err) {
      scanStatus.textContent = err.message;
    }
  }

  wireDropZone($("scan-drop"), $("scan-file"), scanImage);

  /* ── Detector ──────────────────────────────────────────────────── */
  const report = $("detect-report");
  const GRADE_TEXT = {
    A: "可靠掃描 / Scans reliably",
    B: "良好 / Good",
    C: "可掃描,但有風險 / Scannable, with some risk",
    D: "部分掃描器可能失敗 / Some scanners may fail",
    F: "很可能無法掃描 / Likely to fail",
  };

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

  function verdict(grade, title) {
    const box = document.createElement("div");
    box.className = "detect-verdict";
    const letter = document.createElement("div");
    letter.className = `detect-grade grade-${grade}`;
    letter.textContent = grade;
    const text = document.createElement("div");
    text.textContent = title;
    box.append(letter, text);
    return box;
  }

  /* Draws the symbol as sampled, with damaged modules marked in colour. */
  function damageMap(sample, analysis) {
    const CELL = Math.max(4, Math.min(10, Math.floor(400 / (analysis.size + 2))));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = (analysis.size + 2) * CELL;
    canvas.className = "detect-map";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "損傷圖 / Damage map");
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
    report.replaceChildren(verdict("F", "偵測不到 QR Code,目前無法掃描 / No QR code detected, so it can't be scanned as is"));
    const contrast = imageContrast(image);
    const table = document.createElement("table");
    table.className = "detect-table";
    table.append(statRow("影像對比(估計)/ Image contrast (estimate)", `${contrast.toFixed(1)}:1`));
    const tips = document.createElement("ul");
    tips.className = "detect-tips";
    for (const tip of [
      "確認圖片中有完整的 QR Code,三個角落的定位方塊都要清楚 / Make sure the whole code is visible, including all three corner squares",
      "避免模糊、反光與過度傾斜 / Avoid blur, glare, and steep angles",
      contrast < 3 ? "對比太低,請加深圖案或淡化背景 / Contrast is too low: darken the code or lighten the background" : "",
    ].filter(Boolean)) {
      const li = document.createElement("li");
      li.textContent = tip;
      tips.append(li);
    }
    report.append(table, tips);
  }

  function showReport(code, image) {
    const sample = QRAnalyze.sampleSymbol(image, code.location, code.version);
    const analysis = QRAnalyze.analyzeMatrix(sample.modules);
    const grades = QRAnalyze.grade({ ...sample, ...analysis });

    const table = document.createElement("table");
    table.className = "detect-table";
    const body = document.createElement("tbody");
    const used = Math.round(analysis.capacityUsed * 100);
    body.append(
      statRow("內容 / Content", code.data || `(${code.binaryData.length} bytes)`),
      statRow("版本 / Version", `${analysis.version} (${analysis.size} × ${analysis.size})`),
      statRow("容錯等級 / Error correction", analysis.level),
      statRow("遮罩 / Mask", String(analysis.mask)),
      statRow("對比 / Contrast", `${sample.contrast.toFixed(1)}:1${sample.inverted ? "(反白 / inverted)" : ""}`, grades.contrast),
      statRow("靜區 / Quiet zone", `${sample.quietZone}${sample.quietZone >= 4 ? "+" : ""} 模組 / modules(建議 4 / 4 recommended)`, grades.quiet),
      statRow(
        "損傷 / Damage",
        `${analysis.erroredCodewords} / ${analysis.totalCodewords} 碼字 / codewords,容錯已用 ${used}% / ${used}% of correction used`,
        grades.damage,
      ),
    );
    table.append(body);

    const map = document.createElement("figure");
    map.className = "detect-figure";
    const caption = document.createElement("figcaption");
    caption.innerHTML = '<span class="key key-data"></span>資料損傷 / Data damage <span class="key key-function"></span>定位或格式區損傷 / Finder or format damage';
    map.append(damageMap(sample, analysis), caption);

    const layout = document.createElement("div");
    layout.className = "detect-layout";
    layout.append(table, map);

    const note = document.createElement("p");
    note.className = "detect-note";
    note.textContent = "評等是依影像估算,並非 ISO/IEC 15415 正式驗證。重要印刷品請實際列印後再測試。 / Grades are estimates from the image, not an ISO/IEC 15415 verification. Test a printed sample before a large print run.";

    report.replaceChildren(verdict(grades.overall, GRADE_TEXT[grades.overall]), layout, note);
  }

  async function detectImage(file) {
    report.textContent = "分析中 / Analyzing…";
    try {
      const { code, image } = await decodeBitmap(await readFile(file));
      if (code) showReport(code, image);
      else showFailure(image);
    } catch (err) {
      report.textContent = err.message;
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
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); });
})();

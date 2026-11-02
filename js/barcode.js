/* ===================================================================
   Barcode generator: true-size output, with every change re-read by
   an independent decoder (ZXing) before it is offered for download.
   =================================================================== */
(() => {
  /* bwip-js maps 1 pt to 1 unit, times the scale, with 1 module = scale units. */
  const VECTOR_SCALE = 10;
  const PREVIEW_SCALE = 3;
  const MM_PER_PT = 25.4 / 72;
  const MAX_CANVAS = 16000;

  const $ = (id) => document.getElementById(id);
  const typeSelect = $("bc-type");
  const dataInput = $("bc-data");
  const xInput = $("bc-x");
  const heightInput = $("bc-height");
  const textInput = $("bc-text");
  const dpiSelect = $("bc-dpi");
  const sheetSelect = $("bc-sheet");
  const preview = $("bc-preview");
  const errorBox = $("bc-error");
  const infoBox = $("bc-info");
  const scanBox = $("bc-scan");
  const downloads = $("bc-downloads");

  const libraries = () => Promise.all([QRTabs.loadScript("libs/bwip-js.min.js"), QRTabs.loadScript("libs/zxing.min.js")]);

  let current = null;
  let timer = null;
  let ready = false;

  function readSpec() {
    const key = typeSelect.value;
    const type = BarcodeRules.TYPES[key];
    const value = dataInput.value;
    if (!value.trim()) throw new Error("請輸入內容 / enter a value");
    const xDim = parseFloat(xInput.value);
    if (!(xDim >= 0.1 && xDim <= 2)) throw new Error("模組寬度需介於 0.1 到 2 mm / module width must be 0.1 to 2 mm");
    const barHeight = parseFloat(heightInput.value);
    if (!type.twoD && !(barHeight >= 2 && barHeight <= 200)) throw new Error("條高需介於 2 到 200 mm / bar height must be 2 to 200 mm");
    return { key, type, xDim, barHeight, rule: type.normalize(value) };
  }

  /* Options for bwip-js. Its height is in "mm" at 1 module = 1 pt, so convert. */
  function bwipOptions(spec, scale) {
    const options = {
      bcid: spec.rule.bcid,
      text: spec.rule.text,
      scale,
      paddingwidth: spec.type.quiet,
      paddingheight: spec.type.twoD ? spec.type.quiet : 2,
      backgroundcolor: "FFFFFF",
    };
    if (!spec.type.twoD) {
      options.height = (spec.barHeight / spec.xDim) * MM_PER_PT;
      options.includetext = textInput.checked;
      if (spec.key === "code128") options.textxalign = "center";
    }
    return options;
  }

  /* An independent decoder reads the rendered image, as a scanner would. */
  function scanTest(canvas, spec) {
    try {
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)));
      const hints = new Map([[ZXing.DecodeHintType.TRY_HARDER, true]]);
      const scanned = new ZXing.MultiFormatReader().decode(bitmap, hints).getText();
      return { ok: BarcodeRules.matches(spec.key, scanned, spec.rule.expected), scanned };
    } catch {
      return { ok: false, scanned: null };
    }
  }

  function showScan(result, spec) {
    scanBox.className = `bc-scan ${result.ok ? "pass" : "fail"}`;
    if (result.ok) scanBox.textContent = `✓ 掃描測試通過 / Scan test passed: ${result.scanned}`;
    else if (result.scanned === null) scanBox.textContent = "✗ 掃描測試失敗:讀不到條碼 / Scan test failed: could not read the barcode";
    else scanBox.textContent = `✗ 掃描測試失敗:讀到 ${result.scanned},預期 ${spec.rule.expected} / Scan test failed: read ${result.scanned}, expected ${spec.rule.expected}`;
  }

  function update() {
    if (!ready) return;
    errorBox.textContent = "";
    current = null;
    downloads.hidden = true;
    try {
      const spec = readSpec();
      bwipjs.toCanvas(preview, bwipOptions(spec, PREVIEW_SCALE));
      preview.hidden = false;

      const svg = bwipjs.toSVG(bwipOptions(spec, VECTOR_SCALE));
      const vector = QRPrint.parseSvg(svg);
      const unitMm = spec.xDim / VECTOR_SCALE;
      current = { spec, svg, vector, unitMm, width: vector.width * unitMm, height: vector.height * unitMm };

      const check = spec.rule.check === undefined ? "" : ` · 校驗碼 / check digit ${spec.rule.check}${spec.rule.computed ? "(已計算 / calculated)" : "(已驗證 / verified)"}`;
      infoBox.textContent = `${spec.rule.text} · ${current.width.toFixed(2)} × ${current.height.toFixed(2)} mm(含靜區 / with quiet zone)${check}`;
      showScan(scanTest(preview, spec), spec);
      updateDpiNote();
      downloads.hidden = false;
    } catch (err) {
      preview.hidden = true;
      infoBox.textContent = "";
      scanBox.className = "bc-scan";
      scanBox.textContent = "";
      errorBox.textContent = String(err.message || err).replace(/^[\w.]+: /, "");
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(update, 200);
  }

  /* Modules land on whole pixels, so report the X-dimension actually printed. */
  function pixelsPerModule() {
    const dpi = Number(dpiSelect.value);
    return { dpi, px: Math.max(1, Math.round((current.spec.xDim / 25.4) * dpi)) };
  }

  function updateDpiNote() {
    const { dpi, px } = pixelsPerModule();
    const actual = (px / dpi) * 25.4;
    const drift = Math.abs(actual - current.spec.xDim) / current.spec.xDim;
    $("bc-dpi-note").textContent = `${dpi} dpi:每模組 ${px} px,實際 ${actual.toFixed(3)} mm / ${px} px per module, ${actual.toFixed(3)} mm actual${drift > 0.05 ? " ⚠ 與設定值差距超過 5%,建議提高 dpi / more than 5% off, use a higher dpi" : ""}`;
  }

  function save(bytes, type, extension) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement("a");
    a.href = url;
    const stem = sanitizeFilename(current.spec.rule.text).replace(/[()\s]+/g, "") || "barcode";
    a.download = `${current.spec.key}-${stem}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  $("bc-png").addEventListener("click", () => {
    const { dpi, px } = pixelsPerModule();
    const canvas = bwipjs.toCanvas(document.createElement("canvas"), bwipOptions(current.spec, px));
    if (canvas.width > MAX_CANVAS || canvas.height > MAX_CANVAS) {
      errorBox.textContent = "圖片過大,請降低 dpi / image too large, lower the dpi";
      return;
    }
    canvas.toBlob(async (blob) => {
      const png = new Uint8Array(await blob.arrayBuffer());
      save(QRPrint.setPngDpi(png, dpi), "image/png", "png");
    }, "image/png");
  });

  $("bc-svg").addEventListener("click", () => {
    const sized = current.svg.replace("<svg ", `<svg width="${current.width.toFixed(3)}mm" height="${current.height.toFixed(3)}mm" `);
    save(sized, "image/svg+xml;charset=utf-8", "svg");
  });

  $("bc-eps").addEventListener("click", () => {
    save(QRPrint.vectorEps(current.vector, current.unitMm), "application/postscript", "eps");
  });

  $("bc-pdf").addEventListener("click", () => {
    save(QRPrint.vectorPdf(current.vector, current.unitMm), "application/pdf", "pdf");
  });

  /* A full sheet of the same barcode, kept at its true size. */
  $("bc-sheet-btn").addEventListener("click", () => {
    const key = sheetSelect.value;
    const layout = QRPrint.LABEL_LAYOUTS[key];
    if (current.width > layout.label[0] || current.height > layout.label[1]) {
      errorBox.textContent = `條碼 ${current.width.toFixed(1)} × ${current.height.toFixed(1)} mm 超出標籤 ${layout.label[0]} × ${layout.label[1]} mm,請縮小或改選其他標籤 / The barcode doesn't fit this label: reduce it or choose another`;
      return;
    }
    errorBox.textContent = "";
    const bytes = QRPrint.labelSheet(key, layout.cols * layout.rows, (cell, pageHeight) => QRPrint.vectorOps(
      current.vector,
      cell.x + (cell.width - current.width) / 2,
      cell.y + (cell.height - current.height) / 2,
      current.unitMm,
      pageHeight,
    ));
    save(bytes, "application/pdf", "pdf");
  });

  function applyDefaults() {
    const type = BarcodeRules.TYPES[typeSelect.value];
    dataInput.value = type.sample;
    xInput.value = type.xDim;
    heightInput.value = type.barHeight;
    const hide = Boolean(type.twoD);
    heightInput.closest("label").hidden = hide;
    textInput.closest("label").hidden = hide;
  }

  for (const [key, type] of Object.entries(BarcodeRules.TYPES)) typeSelect.add(new Option(type.label, key));
  for (const [key, layout] of Object.entries(QRPrint.LABEL_LAYOUTS)) sheetSelect.add(new Option(layout.name, key));

  typeSelect.addEventListener("change", () => { applyDefaults(); update(); });
  for (const input of [dataInput, xInput, heightInput]) input.addEventListener("input", schedule);
  textInput.addEventListener("change", update);
  dpiSelect.addEventListener("change", () => { if (current) updateDpiNote(); });

  applyDefaults();

  /* The barcode libraries are large, so load them when the tab first opens. */
  document.addEventListener("qrtabchange", async (e) => {
    if (e.detail !== "barcode" || ready) return;
    infoBox.textContent = "載入中 / Loading…";
    try {
      await libraries();
      ready = true;
      infoBox.textContent = "";
      update();
    } catch {
      infoBox.textContent = "";
      errorBox.textContent = "條碼元件載入失敗,請連線後重新整理 / Couldn't load the barcode tools. Reconnect and reload";
    }
  });
})();

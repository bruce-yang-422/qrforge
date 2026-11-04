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
  const SHARE_SCALE = 6;
  /* Text below the barcode, in mm. */
  const CAPTION = { size: 3, minSize: 1.8, gap: 1, bottom: 1, margin: 1 };

  const $ = (id) => document.getElementById(id);
  const typeSelect = $("bc-type");
  const dataInput = $("bc-data");
  const captionInput = $("bc-caption");
  const fontSelect = $("bc-font");
  const xInput = $("bc-x");
  const heightInput = $("bc-height");
  const textInput = $("bc-text");
  const dpiSelect = $("bc-dpi");
  const sheetSelect = $("bc-sheet");
  const preview = $("bc-preview");
  const emptyBox = $("bc-empty");
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
    if (!value.trim()) return null;
    const xDim = parseFloat(xInput.value);
    if (!(xDim >= 0.1 && xDim <= 2)) throw new Error(tr("線條寬度需介於 0.1 到 2 mm", "Bar width must be 0.1 to 2 mm"));
    const barHeight = parseFloat(heightInput.value);
    if (!type.twoD && !(barHeight >= 2 && barHeight <= 200)) throw new Error(tr("條碼高度需介於 2 到 200 mm", "Bar height must be 2 to 200 mm"));
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

  function addCaptionToSvg(svg, caption, unitMm) {
    if (!caption) return svg;
    const [, width, height] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    const top = Number(height) + caption.gap / unitMm;
    const paths = QRPrint.captionSvg(caption, Number(width) * unitMm, top, unitMm);
    const taller = (Number(height) + caption.extra / unitMm).toFixed(2);
    return svg
      .replace(/viewBox="[^"]+"/, `viewBox="0 0 ${width} ${taller}"`)
      .replace("</svg>", `${paths}\n</svg>`);
  }

  function showScan(result, spec) {
    scanBox.className = `scan-badge ${result.ok ? "pass" : "fail"}`;
    if (result.ok) scanBox.textContent = tr(`✓ 掃描測試通過，讀到 ${result.scanned}`, `✓ Scan test passed: read ${result.scanned}`);
    else if (result.scanned === null) scanBox.textContent = tr("✗ 掃描測試失敗：讀不到這個條碼", "✗ Scan test failed: couldn't read this barcode");
    else scanBox.textContent = tr(`✗ 掃描測試失敗：讀到 ${result.scanned}，應為 ${spec.rule.expected}`, `✗ Scan test failed: read ${result.scanned}, expected ${spec.rule.expected}`);
  }

  function clearOutput() {
    current = null;
    preview.hidden = true;
    downloads.hidden = true;
    infoBox.textContent = "";
    scanBox.className = "scan-badge";
    scanBox.textContent = "";
  }

  function update() {
    if (!ready) return;
    errorBox.textContent = "";
    $("bc-share-status").textContent = "";
    clearOutput();
    emptyBox.hidden = false;
    emptyBox.textContent = tr("輸入內容後，條碼會顯示在這裡", "Enter the content and your barcode appears here");
    try {
      const spec = readSpec();
      if (!spec) return;
      const fontState = captionInput.value.trim() ? QRPrint.prepareCaptionFont(fontSelect.value, update) : "ready";
      if (fontState === "loading") {
        emptyBox.textContent = tr("正在下載字型，只有第一次需要…", "Downloading the font. This only happens once…");
        return;
      }
      const unitMm = spec.xDim / VECTOR_SCALE;
      const plainSvg = bwipjs.toSVG(bwipOptions(spec, VECTOR_SCALE));
      const caption = QRPrint.layoutCaption(captionInput.value, QRPrint.parseSvg(plainSvg).width * unitMm, CAPTION, fontSelect.value);
      if (caption && caption.tooLong) throw new Error(tr("下方文字太長，請縮短文字或加大線條寬度", "The text below the barcode is too long. Shorten it or increase the bar width"));
      const svg = addCaptionToSvg(plainSvg, caption, unitMm);
      const vector = QRPrint.parseSvg(svg);

      /* The scan test reads the barcode alone, since the caption isn't data. */
      const plain = bwipjs.toCanvas(document.createElement("canvas"), bwipOptions(spec, PREVIEW_SCALE));
      QRPrint.paintWithCaption(preview, plain, caption, PREVIEW_SCALE / spec.xDim);
      preview.hidden = false;
      emptyBox.hidden = true;
      current = { spec, svg, vector, unitMm, caption, width: vector.width * unitMm, height: vector.height * unitMm };

      const size = tr(`列印尺寸 ${current.width.toFixed(1)} × ${current.height.toFixed(1)} mm`, `Print size ${current.width.toFixed(1)} × ${current.height.toFixed(1)} mm`);
      const check = spec.rule.computed ? tr(`，已自動補上校驗碼 ${spec.rule.check}`, `, check digit ${spec.rule.check} added`) : "";
      infoBox.textContent = size + check;
      showScan(scanTest(plain, spec), spec);
      updateDpiNote();
      updateShareButtons();
      downloads.hidden = false;
      if (fontState === "failed") errorBox.textContent = tr("字型下載失敗，目前顯示的是黑體。連上網路後再改一次文字或字型即可重試。", "The font couldn't be downloaded, so this is using a sans-serif. Once you're online, change the text or font to try again.");
    } catch (err) {
      clearOutput();
      emptyBox.hidden = true;
      errorBox.textContent = String(err.message || err).replace(/^[\w.]+: /, "");
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(update, 200);
  }

  /* Modules land on whole pixels, so warn if that moves the printed size. */
  function pixelsPerModule() {
    const dpi = Number(dpiSelect.value);
    return { dpi, px: Math.max(1, Math.round((current.spec.xDim / 25.4) * dpi)) };
  }

  function updateDpiNote() {
    const { dpi, px } = pixelsPerModule();
    const actual = (px / dpi) * 25.4;
    const drift = Math.abs(actual - current.spec.xDim) / current.spec.xDim;
    $("bc-dpi-note").textContent = drift > 0.05
      ? tr(`⚠ ${dpi} dpi 會讓線條寬度偏差超過 5%，建議選更高的解析度`, `⚠ ${dpi} dpi puts the bar width more than 5% off. Choose a higher resolution`)
      : "";
  }

  const fileStem = () => {
    const stem = sanitizeFilename(current.spec.rule.text).replace(/[()\s]+/g, "") || "barcode";
    return `${current.spec.key}-${stem}`;
  };

  /* Sharp in a chat, while staying far smaller than a print-resolution file. */
  function shareCanvas() {
    const plain = bwipjs.toCanvas(document.createElement("canvas"), bwipOptions(current.spec, SHARE_SCALE));
    return QRPrint.paintWithCaption(document.createElement("canvas"), plain, current.caption, SHARE_SCALE / current.spec.xDim);
  }

  const updateShareButtons = QRShare.wire({
    shareButton: $("bc-share"),
    copyButton: $("bc-copy"),
    status: $("bc-share-status"),
    getCanvas: shareCanvas,
    getName: fileStem,
  });

  function save(bytes, type, extension) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileStem()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  $("bc-png").addEventListener("click", () => {
    const { dpi, px } = pixelsPerModule();
    const plain = bwipjs.toCanvas(document.createElement("canvas"), bwipOptions(current.spec, px));
    const canvas = QRPrint.paintWithCaption(document.createElement("canvas"), plain, current.caption, px / current.spec.xDim);
    if (canvas.width > MAX_CANVAS || canvas.height > MAX_CANVAS) {
      errorBox.textContent = tr("圖片太大了，請選較低的解析度", "The image is too large. Choose a lower resolution");
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
      errorBox.textContent = tr(
        `條碼 ${current.width.toFixed(1)} × ${current.height.toFixed(1)} mm 比這種標籤大，請改選較大的標籤`,
        `The ${current.width.toFixed(1)} × ${current.height.toFixed(1)} mm barcode is bigger than this label. Choose a larger one`,
      );
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

  /* Types are grouped by what people use them for, not by symbology. */
  function buildTypeMenu() {
    const selected = typeSelect.value;
    typeSelect.replaceChildren();
    for (const group of BarcodeRules.groups()) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      for (const key of group.keys) optgroup.append(new Option(BarcodeRules.TYPES[key].label(), key));
      typeSelect.append(optgroup);
    }
    if (selected) typeSelect.value = selected;
  }

  function updateDataHint() {
    const hint = BarcodeRules.TYPES[typeSelect.value].hint();
    $("bc-data-hint").textContent = hint;
  }

  function applyDefaults() {
    const type = BarcodeRules.TYPES[typeSelect.value];
    dataInput.value = type.sample;
    xInput.value = type.xDim;
    heightInput.value = type.barHeight;
    const hide = Boolean(type.twoD);
    $("bc-height-row").hidden = hide;
    $("bc-text-row").hidden = hide;
    updateDataHint();
  }

  buildTypeMenu();
  QRPrint.wireLabelSelect(sheetSelect);

  typeSelect.addEventListener("change", () => { applyDefaults(); update(); });
  for (const input of [dataInput, captionInput, xInput, heightInput]) input.addEventListener("input", schedule);
  textInput.addEventListener("change", update);
  fontSelect.addEventListener("change", update);
  dpiSelect.addEventListener("change", () => { if (current) updateDpiNote(); });

  document.addEventListener("qrlangchange", () => {
    buildTypeMenu();
    updateDataHint();
    update();
  });

  applyDefaults();

  /* The barcode libraries are large, so load them when the tab first opens. */
  document.addEventListener("qrtabchange", async (e) => {
    if (e.detail !== "barcode" || ready) return;
    emptyBox.textContent = tr("載入中…", "Loading…");
    try {
      await libraries();
      ready = true;
      update();
    } catch {
      emptyBox.hidden = true;
      errorBox.textContent = tr("條碼工具載入失敗，請連線後重新整理", "Couldn't load the barcode tools. Reconnect and reload the page");
    }
  });
})();

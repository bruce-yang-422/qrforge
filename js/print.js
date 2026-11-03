/* ===================================================================
   Vector output in physical units: PDF, EPS, and label sheets.
   Sizes are millimetres unless a name says otherwise.
   =================================================================== */
const QRPrint = (() => {
  const PT_PER_MM = 72 / 25.4;
  const num = (v) => String(Math.round(v * 1000) / 1000);

  /* Dimensions follow the published sheet specs. Print at 100% scale. */
  const LABEL_LAYOUTS = {
    L7160: { name: "L7160 — A4, 21 up, 63.5 × 38.1 mm", page: [210, 297], label: [63.5, 38.1], cols: 3, rows: 7, left: 7.2, top: 15.15, pitch: [66.04, 38.1] },
    L7163: { name: "L7163 — A4, 14 up, 99.1 × 38.1 mm", page: [210, 297], label: [99.1, 38.1], cols: 2, rows: 7, left: 4.65, top: 15.15, pitch: [101.6, 38.1] },
    L7165: { name: "L7165 — A4, 8 up, 99.1 × 67.7 mm", page: [210, 297], label: [99.1, 67.7], cols: 2, rows: 4, left: 4.65, top: 13.1, pitch: [101.6, 67.7] },
    5160: { name: "5160 — Letter, 30 up, 66.7 × 25.4 mm", page: [215.9, 279.4], label: [66.675, 25.4], cols: 3, rows: 10, left: 4.7625, top: 12.7, pitch: [69.85, 25.4] },
    5163: { name: "5163 — Letter, 10 up, 101.6 × 50.8 mm", page: [215.9, 279.4], label: [101.6, 50.8], cols: 2, rows: 5, left: 3.96, top: 12.7, pitch: [106.36, 50.8] },
  };

  /* pages: [{ width, height, content }], with content in PDF points, y up. */
  function buildPdf(pages) {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };

    const catalogId = add("");
    const pagesId = add("");
    const kids = pages.map((page) => {
      const stream = page.content;
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const box = `[0 0 ${num(page.width * PT_PER_MM)} ${num(page.height * PT_PER_MM)}]`;
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox ${box} /Resources << >> /Contents ${contentId} 0 R >>`);
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;

    let out = "%PDF-1.4\n";
    const offsets = objects.map((body, i) => {
      const offset = out.length;
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
      return offset;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return asciiBytes(out);
  }

  function asciiBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes;
  }

  /* Draws a module grid as black rectangles, merging runs to keep files small. */
  function matrixOps(matrix, x, y, moduleMm, pageHeight) {
    const unit = moduleMm * PT_PER_MM;
    const left = x * PT_PER_MM;
    const top = (pageHeight - y) * PT_PER_MM;
    let ops = "0 g\n";
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        if (!matrix.isDark(r, c)) continue;
        const start = c;
        while (c + 1 < matrix.size && matrix.isDark(r, c + 1)) c++;
        ops += `${num(left + start * unit)} ${num(top - (r + 1) * unit)} ${num((c - start + 1) * unit)} ${num(unit)} re\n`;
      }
    }
    return `${ops}f\n`;
  }

  /* One QR code per page, with the standard 4-module quiet zone. */
  function qrPdf(matrix, moduleMm, caption = null) {
    const side = (matrix.size + 8) * moduleMm;
    const height = side + (caption ? caption.extra : 0);
    let content = matrixOps(matrix, 4 * moduleMm, 4 * moduleMm, moduleMm, height);
    if (caption) {
      const shapes = captionPaths(caption, side, side + caption.gap, 1)
        .map(({ color, d }) => ({ stroke: 0, fill: color, segments: parsePath(d) }));
      content += vectorOps({ width: side, height, shapes }, 0, 0, 1, height);
    }
    return buildPdf([{ width: side, height, content }]);
  }

  /* Calls draw(cell, pageHeight) for each label and returns the PDF bytes. */
  function labelSheet(layoutKey, count, draw) {
    const layout = LABEL_LAYOUTS[layoutKey];
    const perPage = layout.cols * layout.rows;
    const pages = [];
    for (let i = 0; i < count; i++) {
      const pageIndex = Math.floor(i / perPage);
      if (!pages[pageIndex]) pages[pageIndex] = { width: layout.page[0], height: layout.page[1], content: "" };
      const slot = i % perPage;
      const cell = {
        index: i,
        x: layout.left + (slot % layout.cols) * layout.pitch[0],
        y: layout.top + Math.floor(slot / layout.cols) * layout.pitch[1],
        width: layout.label[0],
        height: layout.label[1],
      };
      pages[pageIndex].content += draw(cell, layout.page[1]);
    }
    return buildPdf(pages);
  }

  /* Places a QR code in the middle of a label, 2 mm in from its short edge. */
  function qrLabelOps(matrix, cell, pageHeight) {
    const moduleMm = qrLabelModule(matrix, cell.width, cell.height);
    const side = matrix.size * moduleMm;
    return matrixOps(matrix, cell.x + (cell.width - side) / 2, cell.y + (cell.height - side) / 2, moduleMm, pageHeight);
  }

  function qrLabelModule(matrix, labelWidth, labelHeight) {
    return (Math.min(labelWidth, labelHeight) - 4) / (matrix.size + 8);
  }

  /* ── SVG paths to PDF / EPS ────────────────────────────────────── */
  const ATTR = (tag, name) => {
    const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
    return m ? m[1] : null;
  };

  /* Reads the subset of SVG that bwip-js emits: stroked bars and filled paths. */
  function parseSvg(svg) {
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!box) throw new Error("Unexpected SVG output");
    const shapes = [];
    for (const [tag] of svg.matchAll(/<path\b[^>]*>/g)) {
      if (tag.includes("clip-rule")) continue;
      const d = ATTR(tag, "d");
      if (!d) continue;
      const stroke = ATTR(tag, "stroke-width");
      const fill = ATTR(tag, "fill");
      shapes.push({ stroke: stroke ? parseFloat(stroke) : 0, fill: fill && fill[0] === "#" ? fill.slice(1) : "000000", segments: parsePath(d) });
    }
    return { width: parseFloat(box[1]), height: parseFloat(box[2]), shapes };
  }

  function parsePath(d) {
    const segments = [];
    for (const [, cmd, args] of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
      segments.push({ cmd, pts: args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [] });
    }
    return segments;
  }

  /* Emits drawing operators through `ops`, flipping y and scaling to points. */
  function shapesToOps(vector, unitPt, originX, originTop, ops) {
    const X = (v) => num(originX + v * unitPt);
    const Y = (v) => num(originTop - v * unitPt);
    let out = "";
    for (const shape of vector.shapes) {
      out += `${[0, 2, 4].map((i) => num(parseInt((shape.fill || "000000").slice(i, i + 2), 16) / 255)).join(" ")} ${ops.color}\n`;
      if (shape.stroke) out += `${num(shape.stroke * unitPt)} ${ops.width}\n`;
      let cur = [0, 0];
      for (const { cmd, pts } of shape.segments) {
        if (cmd === "M") out += `${X(pts[0])} ${Y(pts[1])} ${ops.move}\n`;
        else if (cmd === "L") out += `${X(pts[0])} ${Y(pts[1])} ${ops.line}\n`;
        else if (cmd === "C") out += `${X(pts[0])} ${Y(pts[1])} ${X(pts[2])} ${Y(pts[3])} ${X(pts[4])} ${Y(pts[5])} ${ops.curve}\n`;
        else if (cmd === "Q") {
          /* Neither PDF nor EPS has quadratic curves, so raise them to cubic. */
          const c1 = [cur[0] + (2 / 3) * (pts[0] - cur[0]), cur[1] + (2 / 3) * (pts[1] - cur[1])];
          const c2 = [pts[2] + (2 / 3) * (pts[0] - pts[2]), pts[3] + (2 / 3) * (pts[1] - pts[3])];
          out += `${X(c1[0])} ${Y(c1[1])} ${X(c2[0])} ${Y(c2[1])} ${X(pts[2])} ${Y(pts[3])} ${ops.curve}\n`;
        } else if (cmd === "Z") out += `${ops.close}\n`;
        if (pts.length >= 2) cur = pts.slice(-2);
      }
      out += `${shape.stroke ? ops.stroke : ops.fill}\n`;
    }
    return out;
  }

  const PDF_OPS = { color: "rg", width: "w", move: "m", line: "l", curve: "c", close: "h", stroke: "S", fill: "f*" };
  const EPS_OPS = { color: "setrgbcolor", width: "setlinewidth", move: "moveto", line: "lineto", curve: "curveto", close: "closepath", stroke: "stroke", fill: "eofill" };

  function vectorOps(vector, x, y, unitMm, pageHeight) {
    return `0 g 0 G 0 J\n${shapesToOps(vector, unitMm * PT_PER_MM, x * PT_PER_MM, (pageHeight - y) * PT_PER_MM, PDF_OPS)}`;
  }

  function vectorPdf(vector, unitMm) {
    const width = vector.width * unitMm;
    const height = vector.height * unitMm;
    return buildPdf([{ width, height, content: vectorOps(vector, 0, 0, unitMm, height) }]);
  }

  function vectorEps(vector, unitMm) {
    const unit = unitMm * PT_PER_MM;
    const width = vector.width * unit;
    const height = vector.height * unit;
    return asciiBytes(
      "%!PS-Adobe-3.0 EPSF-3.0\n" +
      `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}\n` +
      `%%HiResBoundingBox: 0 0 ${num(width)} ${num(height)}\n` +
      "%%EndComments\n0 setgray 0 setlinecap\n" +
      shapesToOps(vector, unit, 0, height, EPS_OPS) +
      "showpage\n%%EOF\n"
    );
  }

  /* ── Text below a code ─────────────────────────────────────────── */
  const CAPTION_TRACE_PER_MM = 16; /* About 400 dpi. */
  const CAPTION_STACK = `-apple-system, "Segoe UI", "Noto Sans TC", "Microsoft JhengHei", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  /* Every device has a sans-serif. These two use the system's copy, or else download ours. */
  const CAPTION_FACES = {
    ming: {
      family: "QRForge Ming",
      local: ["PMingLiU", "新細明體", "Songti TC Regular", "STSongti-TC-Regular", "Noto Serif CJK TC", "Noto Serif TC"],
      file: "fonts/noto-serif-tc.woff2",
    },
    kai: {
      family: "QRForge Kai",
      local: ["DFKai-SB", "標楷體", "BiauKai", "Kaiti TC Regular", "STKaiti-TC-Regular"],
      file: "fonts/lxgw-wenkai-tc.woff2",
    },
  };
  const FONT_RETRY_MS = 5000;
  /* Outline width as a share of the text size. Much more and small text clogs up. */
  const CAPTION_THICKEN = 0.03;
  const EMOJI_RUN = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u200d\ufe0f\u20e3])+/gu;

  const captionFont = (px, key) => {
    const face = CAPTION_FACES[key];
    return `${px}px ${face ? `"${face.family}", ` : ""}${CAPTION_STACK}`;
  };

  /* Canvas text can't wait for a font, so callers hold their drawing until it's here.
     Returns "ready", "loading" (onSettled runs when that ends) or "failed". */
  function prepareCaptionFont(key, onSettled) {
    const face = CAPTION_FACES[key];
    if (!face || face.state === "ready") return "ready";
    if (face.state === "loading") {
      face.waiting.add(onSettled);
      return "loading";
    }
    /* A failure stays failed for a moment, or redrawing would retry it in a loop. */
    if (face.state === "failed" && Date.now() - face.failedAt < FONT_RETRY_MS) return "failed";
    face.state = "loading";
    face.waiting = new Set([onSettled]);
    const sources = face.local.map((name) => `local("${name}")`);
    const loading = new FontFace(face.family, [...sources, `url("${face.file}") format("woff2")`].join(", "));
    loading.load().then(() => {
      document.fonts.add(loading);
      face.state = "ready";
    }).catch(() => {
      face.state = "failed";
      face.failedAt = Date.now();
    }).then(() => face.waiting.forEach((callback) => callback()));
    return "loading";
  }

  /* Fits the text to widthMm. Returns null when empty, { tooLong: true } if it can't fit.
     limits: { size, minSize, gap, bottom, margin }, all in mm. */
  function layoutCaption(value, widthMm, limits, font) {
    const text = value.trim();
    if (!text) return null;
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = captionFont(100, font);
    const widthPerMm = ctx.measureText(text).width / 100;
    const size = Math.min(limits.size, (widthMm - limits.margin * 2) / widthPerMm);
    if (size < limits.minSize) return { tooLong: true };
    const height = size * 1.25;
    return { text, font, size, height, gap: limits.gap, extra: limits.gap + height + limits.bottom };
  }

  /* Ming and Kai have hairlines that fade in print, so they get a thin outline.
     Emoji are skipped, since it would only darken their edges. */
  function drawCaption(ctx, caption, px, x, y) {
    const { text } = caption;
    ctx.font = captionFont(px, caption.font);
    ctx.textBaseline = "middle";
    if (CAPTION_FACES[caption.font]) {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = CAPTION_THICKEN * px;
      ctx.lineJoin = "round";
      ctx.textAlign = "left";
      const left = x - ctx.measureText(text).width / 2;
      let at = 0;
      for (const run of [...text.matchAll(EMOJI_RUN), { index: text.length, 0: "" }]) {
        if (run.index > at) ctx.strokeText(text.slice(at, run.index), left + ctx.measureText(text.slice(0, at)).width, y);
        at = run.index + run[0].length;
      }
    }
    ctx.textAlign = "center";
    ctx.fillText(text, x, y);
  }

  /* Copies a rendered code to target and adds the caption underneath. */
  function paintWithCaption(target, source, caption, pxPerMm) {
    target.width = source.width;
    target.height = source.height + (caption ? Math.round(caption.extra * pxPerMm) : 0);
    const ctx = target.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0);
    if (caption) {
      ctx.fillStyle = "#000";
      drawCaption(ctx, caption, caption.size * pxPerMm, target.width / 2, source.height + (caption.gap + caption.height / 2) * pxPerMm);
    }
    return target;
  }

  /* Traces the caption into rectangles, so vector files need no embedded font.
     Returns one path per colour, because emoji are not black. */
  function captionPaths(caption, widthMm, topUnits, unitMm) {
    const scale = CAPTION_TRACE_PER_MM;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(widthMm * scale);
    canvas.height = Math.ceil(caption.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#000";
    drawCaption(ctx, caption, caption.size * scale, canvas.width / 2, canvas.height / 2);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    /* Six levels per channel keeps emoji recognisable and the file small. */
    const hex = (v) => (Math.round(v / 51) * 51).toString(16).padStart(2, "0");
    const colourAt = (x, y) => {
      const i = (y * width + x) * 4;
      return data[i + 3] < 128 ? null : hex(data[i]) + hex(data[i + 1]) + hex(data[i + 2]);
    };

    const unit = 1 / (scale * unitMm);
    const n = (v) => String(Math.round(v * 100) / 100);
    const paths = new Map();
    const flush = (colour, x0, x1, y0, y1) => {
      const left = n(x0 * unit), right = n(x1 * unit), top = n(topUnits + y0 * unit), bottom = n(topUnits + y1 * unit);
      paths.set(colour, `${paths.get(colour) || ""}M${left} ${top}L${right} ${top}L${right} ${bottom}L${left} ${bottom}Z`);
    };
    /* Identical runs on consecutive rows merge into one taller rectangle. */
    let open = new Map();
    for (let y = 0; y <= height; y++) {
      const next = new Map();
      for (let x = 0; y < height && x < width; x++) {
        const colour = colourAt(x, y);
        if (!colour) continue;
        const start = x;
        while (x + 1 < width && colourAt(x + 1, y) === colour) x++;
        const key = `${colour}:${start}:${x + 1}`;
        next.set(key, open.has(key) ? open.get(key) : y);
        open.delete(key);
      }
      for (const [key, startRow] of open) {
        const [colour, x0, x1] = key.split(":");
        flush(colour, Number(x0), Number(x1), startRow, y);
      }
      open = next;
    }
    return Array.from(paths, ([color, d]) => ({ color, d }));
  }

  /* The same paths as SVG elements. */
  function captionSvg(caption, widthMm, topUnits, unitMm) {
    return captionPaths(caption, widthMm, topUnits, unitMm)
      .map(({ color, d }) => `<path d="${d}" fill="#${color}" fill-rule="evenodd" />`).join("\n");
  }

  /* ── PNG resolution metadata ───────────────────────────────────── */
  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* Canvas exports carry no DPI, so insert a pHYs chunk right after IHDR. */
  function setPngDpi(png, dpi) {
    const pixelsPerMetre = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, 9);
    chunk.set(asciiBytes("pHYs"), 4);
    view.setUint32(8, pixelsPerMetre);
    view.setUint32(12, pixelsPerMetre);
    chunk[16] = 1;
    view.setUint32(17, crc32(chunk.subarray(4, 17)));

    const IHDR_END = 33;
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, IHDR_END));
    out.set(chunk, IHDR_END);
    out.set(png.subarray(IHDR_END), IHDR_END + chunk.length);
    return out;
  }

  return {
    LABEL_LAYOUTS, PT_PER_MM,
    buildPdf, qrPdf, labelSheet, qrLabelOps, qrLabelModule,
    parseSvg, vectorOps, vectorPdf, vectorEps, setPngDpi,
    prepareCaptionFont, layoutCaption, paintWithCaption, captionSvg,
  };
})();

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
  function qrPdf(matrix, moduleMm) {
    const side = (matrix.size + 8) * moduleMm;
    const content = matrixOps(matrix, 4 * moduleMm, 4 * moduleMm, moduleMm, side);
    return buildPdf([{ width: side, height: side, content }]);
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
      shapes.push({ stroke: stroke ? parseFloat(stroke) : 0, segments: parsePath(d) });
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

  const PDF_OPS = { width: "w", move: "m", line: "l", curve: "c", close: "h", stroke: "S", fill: "f*" };
  const EPS_OPS = { width: "setlinewidth", move: "moveto", line: "lineto", curve: "curveto", close: "closepath", stroke: "stroke", fill: "eofill" };

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
  };
})();

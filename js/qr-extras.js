/* Payloads and rendering shared by previews, downloads and label sheets. */
const QRExtras = (() => {
  let logo = null;
  let logoUrl = "";
  let logoRevision = 0;
  const clean = (v) => String(v || "").replace(/[\r\n]/g, "");
  const escape = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[;,]/g, "\\$&");
  function payload(type, row) {
    if (type === "vcard") {
      if (!row.name) return "";
      return ["BEGIN:VCARD", "VERSION:3.0", `N:;${escape(row.name)};;;`, `FN:${escape(row.name)}`,
        `ORG:${escape(row.org)}`, `TITLE:${escape(row.title)}`, `TEL:${clean(row.phone)}`,
        `EMAIL:${clean(row.email)}`, `URL:${clean(row.url)}`, "END:VCARD"].join("\r\n");
    }
    const data = clean(row.data).trim();
    if (!data) return "";
    if (type === "email") return `mailto:${encodeURIComponent(data).replace(/%40/gi, "@")}` +
      `?subject=${encodeURIComponent(row.subject || "")}&body=${encodeURIComponent(row.body || "")}`;
    if (type === "phone") { const phone = data.replace(/[^+\d*#,;]/g, ""); return /\d/.test(phone) ? `tel:${phone}` : ""; }
    if (type === "sms") { const phone = data.replace(/[^+\d]/g, ""); return /\d/.test(phone) ? `sms:${phone}?body=${encodeURIComponent(row.body || "")}` : ""; }
    return data;
  }
  async function setLogo(file) {
    const revision = ++logoRevision;
    if (!file) { logo = null; logoUrl = ""; return; }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error(tr("請選擇 5 MB 以內的 PNG、JPG 或 WebP", "Choose a PNG, JPG or WebP under 5 MB"));
    }
    const bitmap = await createImageBitmap(file);
    if (revision !== logoRevision) { bitmap.close(); return; }
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    logoUrl = canvas.toDataURL("image/png");
    logo = canvas;
  }
  function render(data, settings) {
    const qr = qrcode(0, logo ? "H" : settings.ecl);
    qr.addData(data, "Byte"); qr.make();
    const modules = qr.getModuleCount(), scale = settings.scale;
    const size = (modules + 8) * scale;
    const foreground = document.getElementById("opt-foreground").value;
    const background = document.getElementById("opt-background").value;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = foreground;
    let path = "";
    for (let r = 0; r < modules; r++) for (let c = 0; c < modules; c++) if (qr.isDark(r, c)) {
      const x = (c + 4) * scale, y = (r + 4) * scale;
      ctx.fillRect(x, y, scale, scale);
      path += `M${x} ${y}h${scale}v${scale}h-${scale}z`;
    }
    let mark = "";
    if (logo) {
      const box = Math.floor(modules * 0.18) * scale;
      const left = (size - box) / 2;
      const ratio = Math.min((box - scale) / logo.width, (box - scale) / logo.height);
      const w = logo.width * ratio, h = logo.height * ratio;
      ctx.fillStyle = background; ctx.fillRect(left, left, box, box);
      ctx.drawImage(logo, (size - w) / 2, (size - h) / 2, w, h);
      mark = `<rect x="${left}" y="${left}" width="${box}" height="${box}" fill="${background}"/><image href="${logoUrl}" x="${(size-w)/2}" y="${(size-h)/2}" width="${w}" height="${h}"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}px" height="${size}px" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${background}"/><path d="${path}" fill="${foreground}"/>${mark}</svg>`;
    return { format: settings.format, canvas, svg, matrix: { size: modules, isDark: (r,c) => qr.isDark(r,c) }, moduleMm: scale * 0.25 };
  }
  /* Coloured pixel runs become PDF paths, including the logo and CJK captions. */
  function vector(canvas) {
    const { width, height } = canvas;
    const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const paths = new Map();
    const color = (i) => [pixels[i], pixels[i+1], pixels[i+2]].map(v => v.toString(16).padStart(2,"0")).join("");
    let open = new Map();
    for (let y = 0; y <= height; y++) {
      const next = new Map();
      for (let x = 0; y < height && x < width; x++) {
        const start = x, fill = color((y * width + x) * 4);
        while (x + 1 < width && color((y * width + x + 1) * 4) === fill) x++;
        const key = `${fill}:${start}:${x+1}`;
        next.set(key, open.has(key) ? open.get(key) : y); open.delete(key);
      }
      for (const [key, top] of open) {
        const [fill, left, right] = key.split(":");
        if (!paths.has(fill)) paths.set(fill, []);
        paths.get(fill).push({cmd:"M",pts:[+left,top]}, {cmd:"L",pts:[+right,top]}, {cmd:"L",pts:[+right,y]}, {cmd:"L",pts:[+left,y]}, {cmd:"Z",pts:[]});
      }
      open = next;
    }
    return { width, height, shapes: Array.from(paths, ([fill, segments]) => ({ fill, stroke:0, segments })) };
  }
  function pdf(qr) { return QRPrint.vectorPdf(vector(qr.canvas), (qr.matrix.size + 8) * qr.moduleMm / qr.canvas.width); }
  return { payload, render, setLogo, vector, pdf };
})();

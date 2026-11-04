/* Payloads and rendering shared by previews, downloads and label sheets. */
const QRExtras = (() => {
  let logo = null;
  let logoUrl = "";
  let logoAlpha = null;
  const MIN_LOGO_VERSION = 4;
  let logoRevision = 0;
  const clean = (v) => String(v || "").replace(/[\r\n]/g, "");
  const escape = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[;,]/g, "\\$&");
  /* The full number for a code and a local number, or null if the code isn't valid.
     A number that starts with + is already complete. Dropping the leading 0 makes a
     local number work from abroad, except in Italy, where the 0 is part of the number. */
  /* Chinese, Japanese and Korean names read family name first, with no space.
     Older files give one whole name, which stays in the given name's place. */
  function contactName(row) {
    const family = clean(row.family).trim();
    const given = clean(row.given).trim();
    const nickname = clean(row.nickname).trim();
    const whole = clean(row.name).trim();
    const eastAsian = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(family + given);
    const legal = family || given
      ? (eastAsian ? family + given : [given, family].filter(Boolean).join(" "))
      : whole;
    const built = legal && nickname && !legal.includes(nickname) ? `${legal} ${nickname}` : legal || nickname;
    return { family, given: family || given ? given : whole, nickname, full: clean(row.displayName).trim() || built };
  }
  function phoneNumber(code, number) {
    const typed = clean(number).trim();
    if (typed.startsWith("+")) return typed;
    const digits = clean(code).trim().replace(/^(\+|00)/, "");
    if (!digits) return typed;
    if (!/^\d{1,4}$/.test(digits)) return null;
    const local = digits === "39" ? typed : typed.replace(/^[\s()-]*0/, "");
    return /\d/.test(local) ? `+${digits}${local}` : "";
  }
  function payload(type, row) {
    if (type === "vcard") {
      const name = contactName(row);
      if (!name.full) return "";
      const tel = phoneNumber(row.country, row.phone);
      if (tel === null) return "";
      return ["BEGIN:VCARD", "VERSION:3.0", `N:${escape(name.family)};${escape(name.given)};;;`, `FN:${escape(name.full)}`,
        ...(name.nickname ? [`NICKNAME:${escape(name.nickname)}`] : []),
        `ORG:${escape(row.org)}`, `TITLE:${escape(row.title)}`, `TEL:${tel.replace(/[^+\d*#,;]/g, "")}`,
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
    if (!file) { logo = null; logoUrl = ""; logoAlpha = null; return; }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error(tr("請選擇 5 MB 以內的 PNG、JPG 或 WebP", "Choose a PNG, JPG or WebP under 5 MB"));
    }
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(tr("這張圖片無法開啟，可能已損毀", "This image couldn't be opened. It may be damaged"));
    }
    if (revision !== logoRevision) { bitmap.close(); return; }
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    logoAlpha = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    logoUrl = canvas.toDataURL("image/png");
    logo = canvas;
  }
  /* The squares to leave blank: those the logo's visible shape reaches, with half a
     square of margin, and any gaps it encloses. A transparent PNG keeps the code close
     around its outline, and an opaque image clears its whole rectangle. */
  function logoClearing(modules, boxModules, wide, tall) {
    const first = (modules - boxModules) / 2;
    const left = (modules - wide) / 2;
    const top = (modules - tall) / 2;
    const margin = 0.5;
    const reaches = (r, c) => {
      const fromX = Math.max(0, Math.floor((c - margin - left) / wide * logo.width));
      const toX = Math.min(logo.width, Math.ceil((c + 1 + margin - left) / wide * logo.width));
      const fromY = Math.max(0, Math.floor((r - margin - top) / tall * logo.height));
      const toY = Math.min(logo.height, Math.ceil((r + 1 + margin - top) / tall * logo.height));
      for (let y = fromY; y < toY; y++) {
        for (let x = fromX; x < toX; x++) {
          if (logoAlpha[(y * logo.width + x) * 4 + 3] >= 32) return true;
        }
      }
      return false;
    };
    const solid = new Set();
    for (let r = first; r < first + boxModules; r++) {
      for (let c = first; c < first + boxModules; c++) {
        if (reaches(r, c)) solid.add(r * modules + c);
      }
    }
    /* Walk in from the box's edge: whatever can't be reached is enclosed by the logo. */
    const outside = new Set();
    const queue = [];
    const visit = (r, c) => {
      const key = r * modules + c;
      if (r < first || c < first || r >= first + boxModules || c >= first + boxModules) return;
      if (solid.has(key) || outside.has(key)) return;
      outside.add(key);
      queue.push([r, c]);
    };
    for (let i = 0; i < boxModules; i++) {
      visit(first, first + i); visit(first + boxModules - 1, first + i);
      visit(first + i, first); visit(first + i, first + boxModules - 1);
    }
    while (queue.length) {
      const [r, c] = queue.pop();
      visit(r - 1, c); visit(r + 1, c); visit(r, c - 1); visit(r, c + 1);
    }
    for (let r = first; r < first + boxModules; r++) {
      for (let c = first; c < first + boxModules; c++) {
        if (!outside.has(r * modules + c)) solid.add(r * modules + c);
      }
    }
    return solid;
  }

  function render(data, settings) {
    /* Very small codes have too little repair capacity to spare under a logo, so a logo
       starts at version 4 (33 squares wide) and grows from there when the content needs it. */
    const build = (version) => {
      const code = qrcode(version, logo ? "H" : settings.ecl);
      code.addData(data, "Byte");
      code.make();
      return code;
    };
    let qr;
    try {
      qr = build(logo ? MIN_LOGO_VERSION : 0);
    } catch {
      qr = build(0);
    }
    const modules = qr.getModuleCount(), scale = settings.scale;
    const size = (modules + 8) * scale;
    const foreground = document.getElementById("opt-foreground").value;
    const background = document.getElementById("opt-background").value;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = foreground;
    let logoWidth = 0, logoHeight = 0, cleared = new Set();
    if (logo) {
      /* An odd or even count to match the code keeps the blank area on whole squares.
         logoSize is a share of the code's width, limited to what stayed readable in testing. */
      let boxModules = Math.max(3, Math.round(modules * settings.logoSize / 100));
      if ((boxModules - modules) % 2) boxModules += 1;
      const fit = Math.min((boxModules - 1) / logo.width, (boxModules - 1) / logo.height);
      cleared = logoClearing(modules, boxModules, logo.width * fit, logo.height * fit);
      logoWidth = logo.width * fit * scale;
      logoHeight = logo.height * fit * scale;
    }
    let path = "";
    for (let r = 0; r < modules; r++) for (let c = 0; c < modules; c++) if (qr.isDark(r, c) && !cleared.has(r * modules + c)) {
      const x = (c + 4) * scale, y = (r + 4) * scale;
      ctx.fillRect(x, y, scale, scale);
      path += `M${x} ${y}h${scale}v${scale}h-${scale}z`;
    }
    let mark = "";
    if (logo) {
      const x = (size - logoWidth) / 2, y = (size - logoHeight) / 2;
      ctx.drawImage(logo, x, y, logoWidth, logoHeight);
      mark = `<image href="${logoUrl}" x="${x}" y="${y}" width="${logoWidth}" height="${logoHeight}"/>`;
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
  return { payload, contactName, phoneNumber, render, setLogo, vector, pdf };
})();

/* ===================================================================
   Reads every QR code in an image. jsQR reports one code, and groups
   corner squares by size alone, so similar codes side by side can hide
   each other. Here the corner squares are found and grouped by geometry,
   and each group is shown to jsQR with everything around it blanked.
   =================================================================== */
const QRMulti = (() => {
  const SEARCH_MS = 6000;
  const MAX_FINDERS = 600;
  const MAX_VERSION = 40;
  const COVER_GROWTH = 1.05;
  /* Blank modules kept around a group; QR codes should have four. */
  const GROUP_MARGIN = 2;

  const codeKey = (code) => code.data || code.binaryData.join(",");

  function codeBounds({ topLeftCorner: a, topRightCorner: b, bottomRightCorner: c, bottomLeftCorner: d }) {
    const xs = [a.x, b.x, c.x, d.x];
    const ys = [a.y, b.y, c.y, d.y];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  /* Blanks a code that has been read, slightly past its edges, so no later pass sees it. */
  function coverCode(ctx, { topLeftCorner: a, topRightCorner: b, bottomRightCorner: c, bottomLeftCorner: d }) {
    const corners = [a, b, c, d];
    const midX = corners.reduce((sum, p) => sum + p.x, 0) / 4;
    const midY = corners.reduce((sum, p) => sum + p.y, 0) / 4;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    for (const p of corners) ctx.lineTo(midX + (p.x - midX) * COVER_GROWTH, midY + (p.y - midY) * COVER_GROWTH);
    ctx.fill();
  }

  /* True where a pixel is darker than its surroundings, which tolerates uneven light. */
  function darkMap({ data, width, height }) {
    const sums = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        row += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
      }
    }
    const radius = Math.max(16, Math.round(Math.max(width, height) / 16));
    const dark = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height, y + radius + 1);
      for (let x = 0; x < width; x++) {
        const left = Math.max(0, x - radius);
        const right = Math.min(width, x + radius + 1);
        const total = sums[bottom * (width + 1) + right] - sums[top * (width + 1) + right]
          - sums[bottom * (width + 1) + left] + sums[top * (width + 1) + left];
        const i = (y * width + x) * 4;
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        dark[y * width + x] = gray < total / ((bottom - top) * (right - left)) ? 1 : 0;
      }
    }
    return dark;
  }

  /* Corner squares cross as 1:1:3:1:1 in any direction. */
  function isFinderRuns(runs) {
    const module = (runs[0] + runs[1] + runs[2] + runs[3] + runs[4]) / 7;
    if (module < 1) return 0;
    const near = (run, wanted) => Math.abs(run - wanted * module) <= Math.max(1, wanted * module * 0.5);
    return near(runs[0], 1) && near(runs[1], 1) && near(runs[2], 3) && near(runs[3], 1) && near(runs[4], 1) ? module : 0;
  }

  /* Follows a line through (x, y), the middle of a corner square, and returns its centre and module size. */
  function crossCheck(at, x, y, dx, dy, width, height) {
    const color = at(x, y);
    const walk = (sign) => {
      const lengths = [0, 0, 0];
      let px = x;
      let py = y;
      for (let stage = 0; stage < 3; stage++) {
        const wanted = stage === 1 ? 1 - color : color;
        while (px >= 0 && py >= 0 && px < width && py < height && at(px, py) === wanted) {
          lengths[stage]++;
          px += dx * sign;
          py += dy * sign;
        }
      }
      return lengths;
    };
    const before = walk(-1);
    const after = walk(1);
    const runs = [before[2], before[1], before[0] + after[0] - 1, after[1], after[2]];
    const module = isFinderRuns(runs);
    if (!module) return null;
    /* The middle of the centre run, measured along this line. */
    const shift = (after[0] - before[0]) / 2;
    return { module, shift };
  }

  function findFinders(dark, width, height, inverted) {
    const flip = inverted ? 1 : 0;
    const at = (x, y) => dark[y * width + x] ^ flip;
    const hits = [];
    for (let y = 0; y < height; y++) {
      const runs = [];
      let start = 0;
      for (let x = 1; x <= width; x++) {
        if (x < width && at(x, y) === at(x - 1, y)) continue;
        runs.push({ color: at(x - 1, y), start, length: x - start });
        start = x;
        if (runs.length > 5) runs.shift();
        if (runs.length < 5 || runs[0].color !== 1) continue;
        const across = isFinderRuns(runs.map((run) => run.length));
        if (!across) continue;
        const middle = Math.floor(runs[2].start + runs[2].length / 2);
        const down = crossCheck(at, middle, y, 0, 1, width, height);
        if (!down || Math.abs(down.module - across) > across * 0.6) continue;
        const centreY = y + down.shift;
        const row = Math.round(centreY);
        if (row < 0 || row >= height) continue;
        const again = at(middle, row) === 1 ? crossCheck(at, middle, row, 1, 0, width, height) : null;
        if (!again) continue;
        hits.push({ x: middle + again.shift, y: centreY, module: (across + down.module + again.module) / 3 });
      }
    }

    /* Many rows cross each corner square, so merge what lands on the same one. */
    const finders = [];
    for (const hit of hits) {
      const same = finders.find((f) => Math.hypot(f.x - hit.x, f.y - hit.y) < Math.max(f.module, hit.module) * 2);
      if (!same) {
        finders.push({ x: hit.x, y: hit.y, module: hit.module, count: 1 });
        continue;
      }
      same.x = (same.x * same.count + hit.x) / (same.count + 1);
      same.y = (same.y * same.count + hit.y) / (same.count + 1);
      same.module = (same.module * same.count + hit.module) / (same.count + 1);
      same.count++;
    }
    /* Keep the most clearly seen, which also caps the work on busy images. */
    return finders.sort((a, b) => b.count - a.count).slice(0, MAX_FINDERS);
  }

  /* Three corners of a QR code: the same module size, equal arms and a right angle,
     with an arm length that a real QR version can have. */
  function groupFinders(finders) {
    const groups = [];
    for (const corner of finders) {
      const arms = [];
      for (const other of finders) {
        if (other === corner || Math.abs(other.module - corner.module) > corner.module * 0.35) continue;
        const dx = other.x - corner.x;
        const dy = other.y - corner.y;
        const length = Math.hypot(dx, dy);
        const module = (corner.module + other.module) / 2;
        /* Between neighbouring corners, a version-V code has 4V + 10 modules. */
        const version = (length / module - 10) / 4;
        if (version < 0.5 || version > MAX_VERSION + 0.5) continue;
        if (Math.abs(version - Math.round(version)) * 4 > 1.5 + length / module * 0.06) continue;
        arms.push({ finder: other, dx, dy, length });
      }
      for (const right of arms) {
        for (const down of arms) {
          if (right === down) continue;
          if (Math.abs(right.length - down.length) > right.length * 0.2) continue;
          const cross = right.dx * down.dy - right.dy * down.dx;
          const dot = right.dx * down.dx + right.dy * down.dy;
          const area = right.length * down.length;
          /* In image coordinates, going corner to right to down turns clockwise. */
          if (cross < area * 0.9 || Math.abs(dot) > area * 0.3) continue;
          groups.push({ corner, right: right.finder, down: down.finder, length: right.length });
        }
      }
    }
    /* A real group's corners are nearer than corners borrowed from neighbouring codes. */
    return groups.sort((a, b) => a.length - b.length);
  }

  /* The outline of a group's code, grown by a margin measured in modules. */
  function groupOutline({ corner, right, down }) {
    const module = (corner.module + right.module + down.module) / 3;
    const reach = 3.5 + GROUP_MARGIN;
    const lengthX = Math.hypot(right.x - corner.x, right.y - corner.y);
    const lengthY = Math.hypot(down.x - corner.x, down.y - corner.y);
    const ux = (right.x - corner.x) / lengthX * module * reach;
    const uy = (right.y - corner.y) / lengthX * module * reach;
    const vx = (down.x - corner.x) / lengthY * module * reach;
    const vy = (down.y - corner.y) / lengthY * module * reach;
    const far = { x: right.x + down.x - corner.x, y: right.y + down.y - corner.y };
    return [
      { x: corner.x - ux - vx, y: corner.y - uy - vy },
      { x: right.x + ux - vx, y: right.y + uy - vy },
      { x: far.x + ux + vx, y: far.y + uy + vy },
      { x: down.x - ux + vx, y: down.y - uy + vy },
    ];
  }

  /* Shows jsQR one outline's contents, on a blank background. */
  function readGroup(source, outline, width, height) {
    const left = Math.max(0, Math.floor(Math.min(...outline.map((p) => p.x))));
    const top = Math.max(0, Math.floor(Math.min(...outline.map((p) => p.y))));
    const cropWidth = Math.min(width, Math.ceil(Math.max(...outline.map((p) => p.x)))) - left;
    const cropHeight = Math.min(height, Math.ceil(Math.max(...outline.map((p) => p.y)))) - top;
    if (cropWidth < 21 || cropHeight < 21) return null;

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cropWidth, cropHeight);
    ctx.beginPath();
    for (const p of outline) ctx.lineTo(p.x - left, p.y - top);
    ctx.clip();
    ctx.drawImage(source, -left, -top);
    const crop = ctx.getImageData(0, 0, cropWidth, cropHeight);
    const code = jsQR(crop.data, cropWidth, cropHeight, { inversionAttempts: "attemptBoth" });
    if (!code) return null;

    const location = {};
    for (const [name, p] of Object.entries(code.location)) location[name] = { x: p.x + left, y: p.y + top };
    return { ...code, location };
  }

  /* Reading order: top to bottom, and left to right along a row. */
  function inReadingOrder(codes) {
    return codes.sort((a, b) => {
      const first = codeBounds(a.location);
      const second = codeBounds(b.location);
      return Math.abs(first.y - second.y) < first.height / 2 ? first.x - second.x : first.y - second.y;
    });
  }

  /* `first` is a code already read from `image`, or null. Coordinates in the
     returned codes are on `image`, so the Check tab can sample from it. */
  async function findCodes(image, first) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.putImageData(image, 0, 0);

    const found = new Map();
    const keep = (code) => {
      if (codeKey(code) && !found.has(codeKey(code))) found.set(codeKey(code), code);
      coverCode(ctx, code.location);
    };
    if (first) keep(first);

    const started = performance.now();
    let lastPause = started;
    for (const inverted of [false, true]) {
      const dark = darkMap(ctx.getImageData(0, 0, image.width, image.height));
      const finders = findFinders(dark, image.width, image.height, inverted);
      const used = new Set();
      for (const group of groupFinders(finders)) {
        if (used.has(group.corner) || used.has(group.right) || used.has(group.down)) continue;
        const code = readGroup(canvas, groupOutline(group), image.width, image.height);
        if (code) {
          keep(code);
          used.add(group.corner).add(group.right).add(group.down);
        }
        const now = performance.now();
        if (now - started > SEARCH_MS) return inReadingOrder([...found.values()]);
        /* Keep the page responsive during a long search. */
        if (now - lastPause > 50) {
          await new Promise((resolve) => setTimeout(resolve));
          lastPause = performance.now();
        }
      }
    }
    return inReadingOrder([...found.values()]);
  }

  return { findCodes };
})();

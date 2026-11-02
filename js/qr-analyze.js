/* ===================================================================
   QR symbol analysis: reads the raw modules from an image, runs
   Reed-Solomon correction, and reports which modules were damaged.
   Grades are an estimate, not an ISO/IEC 15415 verification.
   =================================================================== */
const QRAnalyze = (() => {
  const LEVELS = ["M", "L", "H", "Q"]; /* Indexed by the 2 format-info bits. */

  const ECC_PER_BLOCK = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };
  const BLOCK_COUNT = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  /* ── GF(256) and Reed-Solomon ──────────────────────────────────── */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const div = (a, b) => (a ? EXP[LOG[a] + 255 - LOG[b]] : 0);

  /* Polynomials here are lowest-degree first. */
  function evalPoly(poly, x) {
    let y = 0;
    for (let i = poly.length - 1; i >= 0; i--) y = mul(y, x) ^ poly[i];
    return y;
  }

  /* Returns { errors: [{ index, value }] }, or null if uncorrectable. */
  function correctBlock(block, eccLen) {
    const n = block.length;
    const syndromes = new Array(eccLen);
    let clean = true;
    for (let j = 0; j < eccLen; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s = mul(s, EXP[j]) ^ block[i];
      syndromes[j] = s;
      if (s) clean = false;
    }
    if (clean) return { errors: [] };

    /* Berlekamp-Massey finds the error locator polynomial. */
    let sigma = [1];
    let prev = [1];
    let length = 0;
    let shift = 1;
    let lastDiscrepancy = 1;
    for (let k = 0; k < eccLen; k++) {
      let d = syndromes[k];
      for (let i = 1; i <= length; i++) d ^= mul(sigma[i] || 0, syndromes[k - i]);
      if (d === 0) {
        shift++;
        continue;
      }
      const next = sigma.slice();
      const factor = div(d, lastDiscrepancy);
      for (let i = 0; i < prev.length; i++) {
        next[i + shift] = (next[i + shift] || 0) ^ mul(factor, prev[i]);
      }
      if (2 * length <= k) {
        length = k + 1 - length;
        prev = sigma;
        lastDiscrepancy = d;
        shift = 1;
      } else {
        shift++;
      }
      sigma = next;
    }
    if (2 * length > eccLen) return null;

    /* Forney gives each error value, with the first root at alpha^0. */
    const omega = new Array(eccLen).fill(0);
    for (let i = 0; i < eccLen; i++) {
      for (let j = 0; j < sigma.length && i + j < eccLen; j++) {
        omega[i + j] ^= mul(syndromes[i], sigma[j]);
      }
    }
    const derivative = sigma.map((c, i) => (i % 2 ? c : 0)).slice(1);

    const errors = [];
    for (let index = 0; index < n; index++) {
      const power = n - 1 - index;
      const inverse = EXP[(255 - power) % 255];
      if (evalPoly(sigma, inverse) !== 0) continue;
      const denominator = evalPoly(derivative, inverse);
      if (denominator === 0) return null;
      errors.push({ index, value: mul(EXP[power], div(evalPoly(omega, inverse), denominator)) });
    }
    return errors.length === length ? { errors } : null;
  }

  /* ── Symbol layout ─────────────────────────────────────────────── */
  function alignmentCentres(version) {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const centres = [6];
    for (let pos = version * 4 + 10; centres.length < count; pos -= step) centres.splice(1, 0, pos);
    return centres;
  }

  /* Maps each function module to its expected colour; data modules stay null. */
  function functionModules(version) {
    const size = version * 4 + 17;
    const expected = Array.from({ length: size }, () => new Array(size).fill(null));
    const set = (x, y, dark) => { expected[y][x] = dark; };

    for (let i = 0; i < size; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    const centres = alignmentCentres(version);
    for (const cy of centres) {
      for (const cx of centres) {
        if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          set(x, y, ring !== 2 && ring !== 4);
        }
      }
    }
    /* Format and version areas hold data-dependent values, marked "reserved". */
    const reserve = (x, y) => set(x, y, "reserved");
    for (const [x, y] of formatCoords(size).flat()) reserve(x, y);
    set(8, size - 8, true);
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          reserve(size - 11 + j, i);
          reserve(i, size - 11 + j);
        }
      }
    }
    return expected;
  }

  function formatCoords(size) {
    const first = [];
    for (let i = 0; i <= 5; i++) first.push([8, i]);
    first.push([8, 7], [8, 8], [7, 8]);
    for (let i = 9; i < 15; i++) first.push([14 - i, 8]);
    const second = [];
    for (let i = 0; i < 8; i++) second.push([size - 1 - i, 8]);
    for (let i = 8; i < 15; i++) second.push([8, size - 15 + i]);
    return [first, second];
  }

  const FORMAT_WORDS = Array.from({ length: 32 }, (_, data) => {
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  });

  const bitCount = (v) => { let n = 0; while (v) { n += v & 1; v >>>= 1; } return n; };

  function readFormat(modules, size) {
    const [first, second] = formatCoords(size);
    const read = (coords) => coords.reduce((word, [x, y], i) => word | ((modules[y][x] ? 1 : 0) << i), 0);
    const seen = [read(first), read(second)];
    let best = null;
    for (let data = 0; data < 32; data++) {
      const distance = Math.min(bitCount(seen[0] ^ FORMAT_WORDS[data]), bitCount(seen[1] ^ FORMAT_WORDS[data]));
      if (!best || distance < best.distance) best = { data, distance };
    }
    return {
      level: LEVELS[best.data >> 3],
      mask: best.data & 7,
      word: FORMAT_WORDS[best.data],
      seen,
      coords: [first, second],
      valid: best.distance <= 3,
    };
  }

  /* Module coordinates in codeword-bit order, following the zigzag path. */
  function dataPath(expected, size) {
    const path = [];
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < size; vert++) {
        const y = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          if (expected[y][x] === null) path.push([x, y]);
        }
      }
    }
    return path;
  }

  /* Groups codeword stream positions by block, undoing the interleaving. */
  function blockLayout(version, level, totalCodewords) {
    const blocks = BLOCK_COUNT[level][version];
    const ecc = ECC_PER_BLOCK[level][version];
    const shortCount = blocks - (totalCodewords % blocks);
    const shortLen = Math.floor(totalCodewords / blocks);
    const layout = Array.from({ length: blocks }, () => []);
    let pos = 0;
    for (let i = 0; i < shortLen + 1 - ecc; i++) {
      for (let b = 0; b < blocks; b++) {
        if (i === shortLen - ecc && b < shortCount) continue;
        layout[b].push(pos++);
      }
    }
    for (let i = 0; i < ecc; i++) {
      for (let b = 0; b < blocks; b++) layout[b].push(pos++);
    }
    return { layout, ecc };
  }

  /* modules: rows of booleans, true = dark. No image processing here. */
  function analyzeMatrix(modules) {
    const size = modules.length;
    const version = (size - 17) / 4;
    if (!Number.isInteger(version) || version < 1 || version > 40) throw new Error(`Invalid symbol size: ${size}`);

    const expected = functionModules(version);
    const format = readFormat(modules, size);
    const damage = Array.from({ length: size }, () => new Uint8Array(size)); /* 1 = data, 2 = function */

    const path = dataPath(expected, size);
    const totalCodewords = Math.floor(path.length / 8);
    const maskFn = MASKS[format.mask];
    const stream = new Uint8Array(totalCodewords);
    for (let i = 0; i < totalCodewords * 8; i++) {
      const [x, y] = path[i];
      if (modules[y][x] !== maskFn(x, y)) stream[i >> 3] |= 0x80 >> (i & 7);
    }

    const { layout, ecc } = blockLayout(version, format.level, totalCodewords);
    const capacity = Math.floor(ecc / 2);
    let erroredCodewords = 0;
    let uncorrectable = 0;
    let worstBlock = 0;
    for (const positions of layout) {
      const result = correctBlock(positions.map((pos) => stream[pos]), ecc);
      if (!result) {
        uncorrectable++;
        worstBlock = Math.max(worstBlock, 1);
        continue;
      }
      erroredCodewords += result.errors.length;
      worstBlock = Math.max(worstBlock, result.errors.length / capacity);
      for (const { index, value } of result.errors) {
        const pos = positions[index];
        for (let bit = 0; bit < 8; bit++) {
          if (value & (0x80 >> bit)) {
            const [x, y] = path[pos * 8 + bit];
            damage[y][x] = 1;
          }
        }
      }
    }

    let functionErrors = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const want = expected[y][x];
        if (typeof want === "boolean" && want !== modules[y][x]) {
          damage[y][x] = 2;
          functionErrors++;
        }
      }
    }
    format.coords.forEach((coords, copy) => {
      coords.forEach(([x, y], bit) => {
        if (((format.word >> bit) & 1) !== ((format.seen[copy] >> bit) & 1)) {
          damage[y][x] = 2;
          functionErrors++;
        }
      });
    });

    return {
      version, size,
      level: format.level,
      mask: format.mask,
      formatValid: format.valid,
      blocks: layout.length,
      totalCodewords,
      eccPerBlock: ecc,
      erroredCodewords,
      uncorrectable,
      functionErrors,
      capacityUsed: worstBlock,
      damage,
    };
  }

  /* ── Reading modules from an image ─────────────────────────────── */
  /* Projective map from the unit square onto the symbol's four corners. */
  function unitSquareMap(tl, tr, br, bl) {
    const dx1 = tr.x - br.x, dx2 = bl.x - br.x, sx = tl.x - tr.x + br.x - bl.x;
    const dy1 = tr.y - br.y, dy2 = bl.y - br.y, sy = tl.y - tr.y + br.y - bl.y;
    const det = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / det;
    const h = (dx1 * sy - sx * dy1) / det;
    const a = tr.x - tl.x + g * tr.x, b = bl.x - tl.x + h * bl.x, c = tl.x;
    const d = tr.y - tl.y + g * tr.y, e = bl.y - tl.y + h * bl.y, f = tl.y;
    return (u, v) => {
      const w = g * u + h * v + 1;
      return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
    };
  }

  const linear = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

  /* image: { data, width, height }. corners: the jsQR location object. */
  function sampleSymbol(image, corners, version) {
    const size = version * 4 + 17;
    const map = unitSquareMap(corners.topLeftCorner, corners.topRightCorner, corners.bottomRightCorner, corners.bottomLeftCorner);
    const point = (col, row) => map(col / size, row / size);
    const pixel = (px, py) => {
      const x = Math.round(px), y = Math.round(py);
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
      const i = (y * image.width + x) * 4;
      return [image.data[i], image.data[i + 1], image.data[i + 2]];
    };

    /* Average a small patch at each module centre to reduce print noise. */
    const colours = [];
    const gray = [];
    for (let r = 0; r < size; r++) {
      colours.push([]);
      gray.push(new Float32Array(size));
      for (let c = 0; c < size; c++) {
        const sum = [0, 0, 0];
        let hits = 0;
        for (const [ox, oy] of [[0, 0], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
          const { x, y } = point(c + 0.5 + ox, r + 0.5 + oy);
          const p = pixel(x, y);
          if (p) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; hits++; }
        }
        const rgb = hits ? sum.map((v) => v / hits) : [255, 255, 255];
        colours[r].push(rgb);
        gray[r][c] = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
      }
    }

    /* A local threshold copes with uneven lighting across the symbol. */
    const RADIUS = 8;
    let globalMin = 255, globalMax = 0;
    for (const row of gray) for (const v of row) { globalMin = Math.min(globalMin, v); globalMax = Math.max(globalMax, v); }
    const globalThreshold = (globalMin + globalMax) / 2;
    const raw = gray.map((row, r) => Array.from(row, (v, c) => {
      let lo = 255, hi = 0;
      for (let y = Math.max(0, r - RADIUS); y <= Math.min(size - 1, r + RADIUS); y++) {
        for (let x = Math.max(0, c - RADIUS); x <= Math.min(size - 1, c + RADIUS); x++) {
          lo = Math.min(lo, gray[y][x]);
          hi = Math.max(hi, gray[y][x]);
        }
      }
      const threshold = hi - lo > (globalMax - globalMin) / 3 ? (lo + hi) / 2 : globalThreshold;
      return v < threshold;
    }));

    /* The finder's centre is dark on a normal code and light on an inverted one. */
    const inverted = !raw[3][3];
    const modules = inverted ? raw.map((row) => row.map((v) => !v)) : raw;

    const dark = [0, 0, 0], light = [0, 0, 0];
    let darkCount = 0, lightCount = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const target = raw[r][c] ? dark : light;
        colours[r][c].forEach((v, i) => { target[i] += v; });
        if (raw[r][c]) darkCount++; else lightCount++;
      }
    }
    const darkMean = dark.map((v) => v / Math.max(1, darkCount));
    const lightMean = light.map((v) => v / Math.max(1, lightCount));
    const lumDark = luminance(darkMean);
    const lumLight = luminance(lightMean);
    const contrast = (Math.max(lumDark, lumLight) + 0.05) / (Math.min(lumDark, lumLight) + 0.05);

    /* Quiet zone: count clear rings outside the symbol, up to the required 4. */
    const backgroundIsLight = !inverted;
    const midpoint = (0.299 * (darkMean[0] + lightMean[0]) + 0.587 * (darkMean[1] + lightMean[1]) + 0.114 * (darkMean[2] + lightMean[2])) / 2;
    const clear = (col, row) => {
      const { x, y } = point(col + 0.5, row + 0.5);
      const p = pixel(x, y);
      if (!p) return false;
      const value = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
      return backgroundIsLight ? value >= midpoint : value < midpoint;
    };
    let quietZone = 0;
    for (let k = 1; k <= 4; k++) {
      let ok = true;
      for (let i = -k; i < size + k && ok; i++) {
        ok = clear(i, -k) && clear(i, size + k - 1) && clear(-k, i) && clear(size + k - 1, i);
      }
      if (!ok) break;
      quietZone = k;
    }

    return { modules, gray, inverted, contrast, quietZone };
  }

  /* ── Grading ───────────────────────────────────────────────────── */
  const GRADES = ["A", "B", "C", "D", "F"];

  function grade({ contrast, quietZone, capacityUsed, uncorrectable, inverted }) {
    const damage = uncorrectable ? 4 : capacityUsed <= 0.1 ? 0 : capacityUsed <= 0.3 ? 1 : capacityUsed <= 0.6 ? 2 : capacityUsed <= 0.9 ? 3 : 4;
    const contrastGrade = contrast >= 7 ? 0 : contrast >= 4.5 ? 1 : contrast >= 3 ? 2 : contrast >= 1.5 ? 3 : 4;
    const quiet = quietZone >= 4 ? 0 : quietZone >= 2 ? 2 : 3;
    const invertedGrade = inverted ? 2 : 0;
    return {
      overall: GRADES[Math.max(damage, contrastGrade, quiet, invertedGrade)],
      damage: GRADES[damage],
      contrast: GRADES[contrastGrade],
      quiet: GRADES[quiet],
    };
  }

  return { analyzeMatrix, sampleSymbol, grade, correctBlock };
})();

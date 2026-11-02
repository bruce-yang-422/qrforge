/* ===================================================================
   Barcode types: input validation, check digits, and print defaults.
   normalize() returns the text for bwip-js and what a scan should read.
   =================================================================== */
const BarcodeRules = (() => {
  /* GS1 mod-10: weights alternate 3, 1 starting from the rightmost digit. */
  function gs1CheckDigit(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      sum += Number(digits[digits.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    }
    return String((10 - (sum % 10)) % 10);
  }

  function withCheckDigit(input, bodyLength, label) {
    const digits = input.replace(/[\s-]/g, "");
    if (!/^\d+$/.test(digits)) throw new Error(`${label} 只能包含數字 / must contain only digits`);
    if (digits.length !== bodyLength && digits.length !== bodyLength + 1) {
      throw new Error(`${label} 需要 ${bodyLength} 或 ${bodyLength + 1} 位數字 / needs ${bodyLength} or ${bodyLength + 1} digits`);
    }
    const body = digits.slice(0, bodyLength);
    const check = gs1CheckDigit(body);
    if (digits.length === bodyLength + 1 && digits[bodyLength] !== check) {
      throw new Error(`${label} 校驗碼應為 ${check},輸入為 ${digits[bodyLength]} / check digit should be ${check}, got ${digits[bodyLength]}`);
    }
    return { full: body + check, check, computed: digits.length === bodyLength };
  }

  /* UPC-E is checked against its expanded 11-digit UPC-A form. */
  function expandUpcE(digits) {
    const ns = digits[0];
    const [a, b, c, d, e, last] = digits.slice(1, 7);
    switch (last) {
      case "0": case "1": case "2": return `${ns}${a}${b}${last}0000${c}${d}${e}`;
      case "3": return `${ns}${a}${b}${c}00000${d}${e}`;
      case "4": return `${ns}${a}${b}${c}${d}00000${e}`;
      default: return `${ns}${a}${b}${c}${d}${e}0000${last}`;
    }
  }

  function upcE(input) {
    const digits = input.replace(/[\s-]/g, "");
    if (!/^[01]\d{6,7}$/.test(digits)) {
      throw new Error("UPC-E 需要 7 或 8 位數字,且以 0 或 1 開頭 / needs 7 or 8 digits starting with 0 or 1");
    }
    const body = digits.slice(0, 7);
    const check = gs1CheckDigit(expandUpcE(body));
    if (digits.length === 8 && digits[7] !== check) {
      throw new Error(`UPC-E 校驗碼應為 ${check},輸入為 ${digits[7]} / check digit should be ${check}, got ${digits[7]}`);
    }
    return { full: body + check, check, computed: digits.length === 7 };
  }

  function isbn(input) {
    const compact = input.replace(/[\s-]/g, "").toUpperCase();
    if (/^\d{9}[\dX]$/.test(compact)) {
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += Number(compact[i]) * (10 - i);
      const expected = (11 - (sum % 11)) % 11;
      const given = compact[9] === "X" ? 10 : Number(compact[9]);
      if (given !== expected) throw new Error("ISBN-10 校驗碼不正確 / incorrect ISBN-10 check digit");
      return { digits: withCheckDigit(`978${compact.slice(0, 9)}`, 12, "ISBN"), hyphenated: null };
    }
    if (!/^97[89]\d{9,10}$/.test(compact)) {
      throw new Error("ISBN 需要 10 位或以 978 / 979 開頭的 13 位數字 / needs 10 digits, or 13 starting with 978 or 979");
    }
    const digits = withCheckDigit(compact, 12, "ISBN");
    /* bwip-js only prints the ISBN line when it is given the real hyphenation. */
    const hyphenated = /^97[89](-\d+){3}-\d$/.test(input.trim()) ? input.trim() : null;
    return { digits, hyphenated };
  }

  /* Fills in a missing check digit for the fixed-length GS1 identifiers. */
  function gs1Text(input) {
    const text = input.trim().replace(/\((0[01])\)(\d+)/g, (match, ai, digits) => {
      const bodyLength = ai === "00" ? 17 : 13;
      if (digits.length !== bodyLength) return match;
      return `(${ai})${digits}${gs1CheckDigit(digits)}`;
    });
    if (!/^(\(\d{2,4}\)[^()]+)+$/.test(text)) {
      throw new Error("請用 (AI)資料 格式,例如 (01)09501101530003 / use (AI)data format, e.g. (01)09501101530003");
    }
    return text;
  }

  const digitsOnly = (text) => text.replace(/[^0-9A-Za-z]/g, "");

  const fixed = (bcid, bodyLength, label) => (input) => {
    const { full, check, computed } = withCheckDigit(input, bodyLength, label);
    return { bcid, text: full, expected: full, check, computed };
  };

  /* xDim is the nominal module width and barHeight the bar height, in mm. */
  const TYPES = {
    ean13: { label: "EAN-13", sample: "590123412345", xDim: 0.33, barHeight: 22.85, quiet: 12, normalize: fixed("ean13", 12, "EAN-13") },
    ean8: { label: "EAN-8", sample: "9638507", xDim: 0.33, barHeight: 18.23, quiet: 8, normalize: fixed("ean8", 7, "EAN-8") },
    upca: { label: "UPC-A", sample: "03600029145", xDim: 0.33, barHeight: 22.85, quiet: 10, normalize: fixed("upca", 11, "UPC-A") },
    upce: {
      label: "UPC-E", sample: "0123456", xDim: 0.33, barHeight: 22.85, quiet: 10,
      normalize(input) {
        const { full, check, computed } = upcE(input);
        return { bcid: "upce", text: full, expected: full, check, computed };
      },
    },
    isbn: {
      label: "ISBN", sample: "978-1-56581-231-4", xDim: 0.33, barHeight: 22.85, quiet: 12,
      normalize(input) {
        const { digits, hyphenated } = isbn(input);
        return { bcid: hyphenated ? "isbn" : "ean13", text: hyphenated || digits.full, expected: digits.full, check: digits.check, computed: digits.computed };
      },
    },
    code128: {
      label: "Code 128", sample: "QRFORGE-128", xDim: 0.33, barHeight: 15, quiet: 10,
      normalize(input) {
        const text = input.trim();
        if (!text) throw new Error("請輸入內容 / enter some text");
        if (!/^[\x20-\x7e]+$/.test(text)) throw new Error("Code 128 只支援英數與 ASCII 符號 / supports printable ASCII only");
        return { bcid: "code128", text, expected: text };
      },
    },
    itf14: { label: "ITF-14 (外箱 / shipping)", sample: "0950110153000", xDim: 0.495, barHeight: 31.75, quiet: 10, normalize: fixed("itf14", 13, "ITF-14") },
    gs1128: {
      label: "GS1-128 (物流 / shipping)", sample: "(01)0950110153000(10)ABC123", xDim: 0.495, barHeight: 31.75, quiet: 10,
      normalize(input) {
        const text = gs1Text(input);
        return { bcid: "gs1-128", text, expected: digitsOnly(text) };
      },
    },
    sscc18: {
      label: "SSCC-18 (棧板 / pallet)", sample: "10614141123456789", xDim: 0.495, barHeight: 31.75, quiet: 10,
      normalize(input) {
        const digits = input.replace(/^\s*\(00\)/, "");
        const { full, check, computed } = withCheckDigit(digits, 17, "SSCC-18");
        return { bcid: "sscc18", text: `(00)${full}`, expected: `00${full}`, check, computed };
      },
    },
    datamatrix: {
      label: "Data Matrix", sample: "https://example.com", xDim: 0.5, barHeight: 0, quiet: 2, twoD: true,
      normalize(input) {
        const text = input.trim();
        if (!text) throw new Error("請輸入內容 / enter some text");
        return { bcid: "datamatrix", text, expected: text };
      },
    },
  };

  /* Scanners report UPC/GS1 data without brackets or separators. */
  function matches(typeKey, scanned, expected) {
    if (typeKey === "code128" || typeKey === "datamatrix") return scanned === expected;
    return digitsOnly(scanned) === digitsOnly(expected);
  }

  return { TYPES, matches, gs1CheckDigit, expandUpcE };
})();

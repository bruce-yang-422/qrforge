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
    if (!/^\d+$/.test(digits)) throw new Error(tr(`${label} 只能輸入數字`, `${label} can only contain digits`));
    if (digits.length !== bodyLength && digits.length !== bodyLength + 1) {
      throw new Error(tr(
        `${label} 需要 ${bodyLength} 或 ${bodyLength + 1} 位數字，目前是 ${digits.length} 位`,
        `${label} needs ${bodyLength} or ${bodyLength + 1} digits. This has ${digits.length}`,
      ));
    }
    const body = digits.slice(0, bodyLength);
    const check = gs1CheckDigit(body);
    if (digits.length === bodyLength + 1 && digits[bodyLength] !== check) {
      throw new Error(tr(
        `最後一位校驗碼應為 ${check}，目前是 ${digits[bodyLength]}。請檢查是否打錯`,
        `The last digit should be ${check}, not ${digits[bodyLength]}. Check for a typo`,
      ));
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
      throw new Error(tr("UPC-E 需要 7 或 8 位數字，且以 0 或 1 開頭", "UPC-E needs 7 or 8 digits, starting with 0 or 1"));
    }
    const body = digits.slice(0, 7);
    const check = gs1CheckDigit(expandUpcE(body));
    if (digits.length === 8 && digits[7] !== check) {
      throw new Error(tr(
        `最後一位校驗碼應為 ${check}，目前是 ${digits[7]}。請檢查是否打錯`,
        `The last digit should be ${check}, not ${digits[7]}. Check for a typo`,
      ));
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
      if (given !== expected) throw new Error(tr("ISBN-10 的校驗碼不正確，請檢查是否打錯", "The ISBN-10 check digit is wrong. Check for a typo"));
      return { digits: withCheckDigit(`978${compact.slice(0, 9)}`, 12, "ISBN"), hyphenated: null };
    }
    if (!/^97[89]\d{9,10}$/.test(compact)) {
      throw new Error(tr("ISBN 需要 10 位，或以 978、979 開頭的 13 位數字", "ISBN needs 10 digits, or 13 starting with 978 or 979"));
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
      throw new Error(tr("請用「(代碼)內容」的格式，例如 (01)09501101530003", "Use the format (code)data, such as (01)09501101530003"));
    }
    return text;
  }

  const digitsOnly = (text) => text.replace(/[^0-9A-Za-z]/g, "");

  const fixed = (bcid, bodyLength, label) => (input) => {
    const { full, check, computed } = withCheckDigit(input, bodyLength, label);
    return { bcid, text: full, expected: full, check, computed };
  };

  const digitsHint = (n) => () => tr(`輸入 ${n} 位數字，校驗碼會自動計算`, `Enter ${n} digits. The check digit is added for you`);

  /* xDim is the nominal module width and barHeight the bar height, in mm. */
  const TYPES = {
    ean13: {
      label: () => tr("EAN-13：一般商品", "EAN-13: most products"), hint: digitsHint(12),
      sample: "590123412345", xDim: 0.33, barHeight: 22.85, quiet: 12, normalize: fixed("ean13", 12, "EAN-13"),
    },
    ean8: {
      label: () => tr("EAN-8：小型商品", "EAN-8: small products"), hint: digitsHint(7),
      sample: "9638507", xDim: 0.33, barHeight: 18.23, quiet: 8, normalize: fixed("ean8", 7, "EAN-8"),
    },
    upca: {
      label: () => tr("UPC-A：北美商品", "UPC-A: North American products"), hint: digitsHint(11),
      sample: "03600029145", xDim: 0.33, barHeight: 22.85, quiet: 10, normalize: fixed("upca", 11, "UPC-A"),
    },
    upce: {
      label: () => tr("UPC-E：北美小型商品", "UPC-E: small North American products"), hint: digitsHint(7),
      sample: "0123456", xDim: 0.33, barHeight: 22.85, quiet: 10,
      normalize(input) {
        const { full, check, computed } = upcE(input);
        return { bcid: "upce", text: full, expected: full, check, computed };
      },
    },
    isbn: {
      label: () => tr("ISBN：書籍", "ISBN: books"),
      hint: () => tr("輸入 ISBN，可含連字號", "Enter the ISBN, with or without hyphens"),
      sample: "978-1-56581-231-4", xDim: 0.33, barHeight: 22.85, quiet: 12,
      normalize(input) {
        const { digits, hyphenated } = isbn(input);
        return { bcid: hyphenated ? "isbn" : "ean13", text: hyphenated || digits.full, expected: digits.full, check: digits.check, computed: digits.computed };
      },
    },
    itf14: {
      label: () => tr("ITF-14：外箱", "ITF-14: cartons"), hint: digitsHint(13),
      sample: "0950110153000", xDim: 0.495, barHeight: 31.75, quiet: 10, normalize: fixed("itf14", 13, "ITF-14"),
    },
    gs1128: {
      label: () => tr("GS1-128：物流資訊", "GS1-128: logistics data"),
      hint: () => tr("用括號標示資料代碼，例如 (01) 商品、(10) 批號", "Mark each field with a code in brackets, such as (01) product or (10) batch"),
      sample: "(01)0950110153000(10)ABC123", xDim: 0.495, barHeight: 31.75, quiet: 10,
      normalize(input) {
        const text = gs1Text(input);
        return { bcid: "gs1-128", text, expected: digitsOnly(text) };
      },
    },
    sscc18: {
      label: () => tr("SSCC-18：棧板與貨運單位", "SSCC-18: pallets and shipments"), hint: digitsHint(17),
      sample: "10614141123456789", xDim: 0.495, barHeight: 31.75, quiet: 10,
      normalize(input) {
        const digits = input.replace(/^\s*\(00\)/, "");
        const { full, check, computed } = withCheckDigit(digits, 17, "SSCC-18");
        return { bcid: "sscc18", text: `(00)${full}`, expected: `00${full}`, check, computed };
      },
    },
    code128: {
      label: () => tr("Code 128：內部編號、資產標籤", "Code 128: internal IDs and asset tags"),
      hint: () => tr("可輸入英文、數字與符號", "Letters, numbers, and symbols"),
      sample: "QRFORGE-128", xDim: 0.33, barHeight: 15, quiet: 10,
      normalize(input) {
        const text = input.trim();
        if (!/^[\x20-\x7e]+$/.test(text)) throw new Error(tr("Code 128 只能輸入英文、數字與半形符號", "Code 128 only supports letters, numbers, and basic symbols"));
        return { bcid: "code128", text, expected: text };
      },
    },
    datamatrix: {
      label: () => tr("Data Matrix：小型零件、方形條碼", "Data Matrix: small parts, square code"),
      hint: () => tr("可輸入文字或網址", "Text or a link"),
      sample: "https://example.com", xDim: 0.5, barHeight: 0, quiet: 2, twoD: true,
      normalize(input) {
        const text = input.trim();
        if (!text) throw new Error(tr("請輸入內容", "Enter some content"));
        return { bcid: "datamatrix", text, expected: text };
      },
    },
  };

  const groups = () => [
    { label: tr("商品與零售", "Products and retail"), keys: ["ean13", "ean8", "upca", "upce"] },
    { label: tr("書籍", "Books"), keys: ["isbn"] },
    { label: tr("物流與貨運", "Logistics and shipping"), keys: ["itf14", "gs1128", "sscc18"] },
    { label: tr("其他", "Other"), keys: ["code128", "datamatrix"] },
  ];

  /* Scanners report UPC/GS1 data without brackets or separators. */
  function matches(typeKey, scanned, expected) {
    if (typeKey === "code128" || typeKey === "datamatrix") return scanned === expected;
    return digitsOnly(scanned) === digitsOnly(expected);
  }

  return { TYPES, groups, matches, gs1CheckDigit, expandUpcE };
})();

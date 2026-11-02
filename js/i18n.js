/* Interface language. Static text uses data-i18n="中文|English"; scripts call tr(). */
const QRI18n = (() => {
  const KEY = "qrforge-lang";
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  let lang = stored() || (/^zh/i.test(navigator.language) ? "zh" : "en");

  const pick = (value) => value.split("|")[lang === "zh" ? 0 : 1];

  function apply() {
    document.documentElement.lang = lang === "zh" ? "zh-TW" : "en";
    for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = pick(el.dataset.i18n);
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = pick(el.dataset.i18nPlaceholder);
    for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", pick(el.dataset.i18nLabel));
  }

  function toggle() {
    lang = lang === "zh" ? "en" : "zh";
    try { localStorage.setItem(KEY, lang); } catch { /* Private mode: keep it for this visit. */ }
    apply();
    document.dispatchEvent(new CustomEvent("qrlangchange"));
  }

  return { apply, toggle, get lang() { return lang; } };
})();

function tr(zh, en) {
  return QRI18n.lang === "zh" ? zh : en;
}

QRI18n.apply();
document.getElementById("lang-btn").addEventListener("click", QRI18n.toggle);

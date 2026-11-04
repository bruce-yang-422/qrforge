/* Tab navigation, deep links (#scan), and on-demand script loading. */
const QRTabs = (() => {
  const tabs = Array.from(document.querySelectorAll("[role='tab']"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  const loaded = new Map();
  let active = null;

  function loadScript(src) {
    if (!loaded.has(src)) {
      loaded.set(src, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => { loaded.delete(src); reject(new Error(`Failed to load ${src}`)); };
        document.head.append(script);
      }));
    }
    return loaded.get(src);
  }

  function select(name, updateHash = true) {
    if (name === active) return;
    active = name;
    for (const tab of tabs) {
      const selected = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    /* A panel can belong to several tabs, such as the shared QR results. */
    for (const panel of panels) panel.hidden = !panel.dataset.panel.split(" ").includes(name);
    if (updateHash) history.replaceState(null, "", `#${name}`);
    document.dispatchEvent(new CustomEvent("qrtabchange", { detail: name }));
  }

  const fromHash = () => {
    const name = location.hash.slice(1);
    return tabs.some((tab) => tab.dataset.tab === name) ? name : tabs[0].dataset.tab;
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab.dataset.tab));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      next.focus();
      select(next.dataset.tab);
    });
  });
  window.addEventListener("hashchange", () => select(fromHash(), false));

  /* Download or print: each output panel shows one at a time. */
  document.addEventListener("change", (e) => {
    const root = e.target.closest(".output-root");
    if (!root || !e.target.closest(".output-tabs")) return;
    for (const pane of root.querySelectorAll(".output-pane")) pane.hidden = pane.dataset.pane !== e.target.value;
  });

  return { loadScript, select, current: () => active, start: () => select(fromHash(), false) };
})();

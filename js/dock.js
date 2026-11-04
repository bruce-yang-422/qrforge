/* The bar at the bottom of phone screens: a small preview and the download button,
   for while the steps scroll. It steps aside once the real download button is in view. */
(() => {
  const $ = (id) => document.getElementById(id);
  const dock = $("dock");
  const thumb = $("dock-thumb");
  const label = $("dock-label");

  /* Each view with a single result to download. Batch has many, so it has no dock. */
  const VIEWS = {
    generate: { source: () => document.querySelector("#qp-stage canvas, #qp-stage img"), button: () => $("qp-download") },
    barcode: { source: () => $("bc-preview"), button: () => $("bc-png") },
  };

  let view = null;
  let realButtonInView = false;

  function update() {
    const current = VIEWS[view];
    const source = current && current.source();
    const button = current && current.button();
    const ready = Boolean(source) && !source.hidden && !button.disabled && button.offsetParent !== null;
    dock.hidden = !ready || realButtonInView;
    document.body.classList.toggle("has-dock", ready);
    if (!ready) return;
    label.textContent = button.textContent.trim();
    const context = thumb.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, thumb.width, thumb.height);
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    if (!width || !height) return;
    const scale = Math.min(thumb.width / width, thumb.height / height);
    context.drawImage(source, (thumb.width - width * scale) / 2, (thumb.height - height * scale) / 2, width * scale, height * scale);
  }

  const observer = new IntersectionObserver((entries) => {
    realButtonInView = entries.some((entry) => entry.isIntersecting);
    update();
  });

  function watch() {
    observer.disconnect();
    realButtonInView = false;
    const current = VIEWS[view];
    if (current) observer.observe(current.button());
    update();
  }

  document.addEventListener("qrtabchange", (e) => {
    view = e.detail;
    watch();
  });

  $("dock-download").addEventListener("click", () => VIEWS[view].button().click());
  $("dock-preview").addEventListener("click", () => {
    VIEWS[view].source().scrollIntoView({ behavior: "smooth", block: "center" });
  });

  /* Anything that redraws a code, or switches between Download and Print, can change the dock. */
  const refresh = new MutationObserver(update);
  for (const id of ["qp-stage", "qp-download", "bc-downloads"]) {
    refresh.observe($(id), { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden"] });
  }
  $("bc-preview").addEventListener("load", update);
  document.addEventListener("change", (e) => { if (e.target.closest(".output-tabs")) update(); });
  document.addEventListener("input", () => setTimeout(update, 400));
  document.addEventListener("qrlangchange", update);
})();

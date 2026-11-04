/* Receive shared text, links and images without sending them to a server. */
(async () => {
  const params = new URLSearchParams(location.search);
  const incomingId = params.get("share_id");
  const failure = params.get("share_error");
  if (failure) {
    document.getElementById("qi-error").textContent = failure === "size"
      ? tr("一次最多分享 10 張圖片，每張 20 MB 以內", "Share up to 10 images, each under 20 MB")
      : tr("無法接收分享內容，請重試或使用貼上與選擇圖片", "Couldn't receive the share. Try again, paste, or choose an image");
    params.delete("share_error");
    QRTabs.select("generate");
  }
  let files = [];
  if (incomingId) {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("qrforge-incoming", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("shares");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      let entry;
      try {
        entry = await new Promise((resolve, reject) => {
          const tx = db.transaction("shares", "readwrite");
          const store = tx.objectStore("shares");
          const request = store.get(incomingId);
          request.onsuccess = () => { entry = request.result; store.delete(incomingId); };
          tx.oncomplete = () => resolve(entry); tx.onerror = () => reject(tx.error);
        });
      } finally { db.close(); }
      if (!entry) throw new Error("Missing share");
      params.set("share_title", entry.title); params.set("share_text", entry.text); params.set("share_url", entry.url);
      files = entry.files || [];
    } catch {
      document.getElementById("qi-error").textContent = tr("分享內容已失效，請重新分享", "This share has expired. Please share it again");
    }
    params.delete("share_id");
  }
  const keys = ["share_title", "share_text", "share_url"];
  if (!incomingId && !failure && !keys.some(key => params.has(key))) return;
  const values = keys.map(key => params.get(key)?.trim()).filter(Boolean);
  const unique = [...new Set(values)];
  const url = params.get("share_url")?.trim();
  const text = params.get("share_text")?.trim();
  const data = url && (!text || text === url) ? url : unique.join("\n");
  const isLink = /^https?:\/\/[^\s]+$/i.test(data);
  if (data) {
    document.querySelector(`input[name="qi-type"][value="${isLink ? "url" : "text"}"]`).checked = true;
    document.getElementById("qi-data").value = data;
    QRTabs.select("generate"); updateTypeFields(); renderQuick();
  }
  if (files.length) document.dispatchEvent(new CustomEvent("qrsharedfiles", {detail:files}));
  for (const key of keys) params.delete(key);
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}#${files.length ? "scan" : "generate"}`);
})();

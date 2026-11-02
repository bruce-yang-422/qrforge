/* Share and copy buttons for an image. PNG is used wherever it works, then JPG. */
const QRShare = (() => {
  const FORMATS = [
    { type: "image/png", ext: "png" },
    { type: "image/jpeg", ext: "jpg" },
  ];

  const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));

  function shareFormat() {
    if (!navigator.canShare) return null;
    return FORMATS.find(({ type, ext }) => navigator.canShare({ files: [new File([""], `image.${ext}`, { type })] })) || null;
  }

  function copyType() {
    if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) return null;
    if (!ClipboardItem.supports) return "image/png";
    const format = FORMATS.find(({ type }) => ClipboardItem.supports(type));
    return format ? format.type : null;
  }

  /* getCanvas and getName are called on click, so they see the current image. */
  function wire({ shareButton, copyButton, status, getCanvas, getName }) {
    shareButton.addEventListener("click", async () => {
      status.textContent = "";
      const format = shareFormat();
      if (!format) return;
      try {
        const blob = await toBlob(getCanvas(), format.type);
        await navigator.share({ files: [new File([blob], `${getName()}.${format.ext}`, { type: format.type })] });
      } catch (err) {
        /* AbortError means the user closed the share sheet, which isn't a failure. */
        if (err.name !== "AbortError") {
          status.textContent = tr("無法分享，請改用下載或複製圖片", "Couldn't share. Try downloading or copying the image");
        }
      }
    });

    copyButton.addEventListener("click", async () => {
      status.textContent = "";
      const type = copyType();
      if (!type) return;
      try {
        /* Safari needs the clipboard write to start before the image is ready. */
        await navigator.clipboard.write([new ClipboardItem({ [type]: toBlob(getCanvas(), type) })]);
        status.textContent = tr("已複製，到 LINE 或其他對話貼上即可", "Copied. Paste it into LINE or any other chat");
      } catch {
        status.textContent = tr("無法複製，請改用下載", "Couldn't copy. Try downloading instead");
      }
    });

    return () => {
      shareButton.hidden = !shareFormat();
      copyButton.hidden = !copyType();
    };
  }

  return { wire };
})();

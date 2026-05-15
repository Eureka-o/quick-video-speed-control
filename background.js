function sanitizeFilename(value) {
  return String(value || "video")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "video";
}

function getExtensionFromUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const match = path.match(/\.(mp4|webm|ogg|mov|m4v|mkv)(?:$|[?#])/);
    return match ? match[1] : "mp4";
  } catch (error) {
    return "mp4";
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "SPACE_HOLD_DOWNLOAD_VIDEO") return false;

  const url = message.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    sendResponse({ ok: false, error: "没有可直接下载的视频地址。" });
    return false;
  }

  const extension = getExtensionFromUrl(url);
  const filename = `Quick Video Speed Control/${sanitizeFilename(message.title)}.${extension}`;

  chrome.downloads.download(
    {
      url,
      filename,
      saveAs: Boolean(message.saveAs),
      conflictAction: "uniquify"
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, downloadId });
    }
  );

  return true;
});

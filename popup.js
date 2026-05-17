const DEFAULT_SETTINGS = SPACE_HOLD_DEFAULT_SETTINGS;

const PRESET_RATES = [1.5, 2.0, 2.5, 3.0];

const language = document.querySelector("#language");
const enabled = document.querySelector("#enabled");
const holdRate = document.querySelector("#holdRate");
const holdRateValue = document.querySelector("#holdRateValue");
const longPressDelayMs = document.querySelector("#longPressDelayMs");
const delayValue = document.querySelector("#delayValue");
const seekStepSeconds = document.querySelector("#seekStepSeconds");
const seekStepValue = document.querySelector("#seekStepValue");
const speedHoldKeyLabel = document.querySelector("#speedHoldKeyLabel");
const seekBackwardKeyLabel = document.querySelector("#seekBackwardKeyLabel");
const seekForwardKeyLabel = document.querySelector("#seekForwardKeyLabel");
const enableSeekKeys = document.querySelector("#enableSeekKeys");
const showBadge = document.querySelector("#showBadge");
const shortPressAction = document.querySelector("#shortPressAction");
const presetRates = document.querySelector("#presetRates");
const videoState = document.querySelector("#videoState");
const videoMeta = document.querySelector("#videoMeta");
const videoHint = document.querySelector("#videoHint");
const saveVideo = document.querySelector("#saveVideo");
const copyVideoUrl = document.querySelector("#copyVideoUrl");
const downloadProgressPanel = document.querySelector("#downloadProgressPanel");
const downloadProgressLabel = document.querySelector("#downloadProgressLabel");
const downloadProgressValue = document.querySelector("#downloadProgressValue");
const downloadProgress = document.querySelector("#downloadProgress");
const openOptions = document.querySelector("#openOptions");
const reset = document.querySelector("#reset");

let currentSettings = { ...DEFAULT_SETTINGS };
let currentVideoInfo = null;
let pendingSettings = {};
let pendingSettingsTimer = null;
let trackedDownloadId = null;

function formatRate(value) {
  return `${Number(value).toFixed(1)}x`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatKey(code) {
  const map = {
    Space: "Space",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    PageUp: "Page Up",
    PageDown: "Page Down",
    Home: "Home",
    End: "End"
  };
  if (map[code]) return map[code];
  if (code?.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code?.startsWith("Digit")) return code.slice(5);
  return code || t("notSet");
}

function getLanguage() {
  return getSpaceHoldLanguage(currentSettings.language);
}

function t(key, values) {
  return spaceHoldTranslate(getLanguage(), key, values);
}

function applyText() {
  applySpaceHoldI18n(getLanguage());
  document.title = t("pageTitle");
}

function saveSettings(values) {
  window.clearTimeout(pendingSettingsTimer);
  pendingSettings = {};
  chrome.storage.sync.set(values);
}

function saveSetting(key, value) {
  saveSettings({ [key]: value });
}

function saveSettingsSoon(values) {
  pendingSettings = { ...pendingSettings, ...values };
  window.clearTimeout(pendingSettingsTimer);
  pendingSettingsTimer = window.setTimeout(() => {
    const next = pendingSettings;
    pendingSettings = {};
    chrome.storage.sync.set(next);
  }, 180);
}

function saveSettingSoon(key, value) {
  saveSettingsSoon({ [key]: value });
}

function updatePresetState(value) {
  const rounded = Number(value).toFixed(1);
  presetRates.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.rate === rounded);
  });
}

function render(settings) {
  currentSettings = normalizeSpaceHoldSettings(settings);
  applyText();
  language.value = getLanguage();
  enabled.checked = Boolean(currentSettings.enabled);
  holdRate.value = currentSettings.holdRate;
  holdRateValue.textContent = formatRate(currentSettings.holdRate);
  longPressDelayMs.value = currentSettings.longPressDelayMs;
  delayValue.textContent = `${currentSettings.longPressDelayMs}ms`;
  seekStepSeconds.value = currentSettings.seekStepSeconds;
  seekStepValue.textContent = `${currentSettings.seekStepSeconds}s`;
  speedHoldKeyLabel.textContent = formatKey(currentSettings.speedHoldKey);
  seekBackwardKeyLabel.textContent = formatKey(currentSettings.seekBackwardKey);
  seekForwardKeyLabel.textContent = formatKey(currentSettings.seekForwardKey);
  enableSeekKeys.checked = Boolean(currentSettings.enableSeekKeys);
  showBadge.checked = Boolean(currentSettings.showBadge);
  shortPressAction.value = currentSettings.shortPressAction;
  updatePresetState(currentSettings.holdRate);
}

function setVideoUi(info) {
  currentVideoInfo = info;
  videoState.classList.remove("ready", "warn");

  if (!info || !info.found) {
    videoState.textContent = t("notDetected");
    videoState.classList.add("warn");
    videoMeta.textContent = t("currentTab");
    videoHint.textContent = info?.reason || t("noSaveVideo");
    saveVideo.disabled = true;
    copyVideoUrl.disabled = true;
    return;
  }

  const duration = formatDuration(info.duration);
  videoMeta.textContent = duration
    ? t("duration", { duration })
    : t("currentRate", { rate: formatRate(info.playbackRate || 1) });
  copyVideoUrl.disabled = !info.visibleUrl;

  if (info.canSave) {
    videoState.textContent = t("readyToSave");
    videoState.classList.add("ready");
    videoHint.textContent = t("directVideoHint");
    saveVideo.disabled = false;
    return;
  }

  videoState.textContent = t("restrictedStream");
  videoState.classList.add("warn");
  videoHint.textContent = info.reason;
  saveVideo.disabled = true;
}

function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs && tabs[0] ? tabs[0] : null);
  });
}

function refreshVideoInfo() {
  setVideoUi({ found: false, reason: t("checkingVideo") });
  getActiveTab((tab) => {
    if (!tab || !tab.id) {
      setVideoUi({ found: false, reason: t("noAvailableTab") });
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "SPACE_HOLD_VIDEO_INFO" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setVideoUi({ found: false, reason: t("unsupportedPage") });
        return;
      }
      setVideoUi(response);
    });
  });
}

function buildPresets() {
  presetRates.replaceChildren();
  PRESET_RATES.forEach((rate) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rate = rate.toFixed(1);
    button.textContent = formatRate(rate);
    button.addEventListener("click", () => {
      holdRate.value = rate;
      holdRateValue.textContent = formatRate(rate);
      updatePresetState(rate);
      saveSetting("holdRate", rate);
    });
    presetRates.appendChild(button);
  });
}

buildPresets();

chrome.storage.sync.get(null, (settings) => {
  render(settings);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  chrome.storage.sync.get(null, (settings) => {
    render(settings);
  });
});

language.addEventListener("change", () => {
  currentSettings = normalizeSpaceHoldSettings({ ...currentSettings, language: language.value });
  render(currentSettings);
  saveSetting("language", language.value);
  refreshVideoInfo();
});

enabled.addEventListener("change", () => {
  saveSetting("enabled", enabled.checked);
});

holdRate.addEventListener("input", () => {
  const value = Number(holdRate.value);
  holdRateValue.textContent = formatRate(value);
  updatePresetState(value);
  saveSettingSoon("holdRate", value);
});

longPressDelayMs.addEventListener("input", () => {
  const value = Number(longPressDelayMs.value);
  delayValue.textContent = `${value}ms`;
  saveSettingSoon("longPressDelayMs", value);
});

seekStepSeconds.addEventListener("input", () => {
  const value = Number(seekStepSeconds.value);
  seekStepValue.textContent = `${value}s`;
  saveSettingSoon("seekStepSeconds", value);
});

enableSeekKeys.addEventListener("change", () => {
  saveSetting("enableSeekKeys", enableSeekKeys.checked);
});

showBadge.addEventListener("change", () => {
  saveSetting("showBadge", showBadge.checked);
});

shortPressAction.addEventListener("change", () => {
  saveSetting("shortPressAction", shortPressAction.value);
});

saveVideo.addEventListener("click", () => {
  if (!currentVideoInfo?.canSave) return;
  const downloadOptions = getSpaceHoldDownloadOptions(currentSettings);
  showDownloadProgress(t("downloadPreparing"), 0);
  chrome.runtime.sendMessage(
    {
      type: "SPACE_HOLD_DOWNLOAD_VIDEO",
      url: currentVideoInfo.url,
      title: currentVideoInfo.pageTitle,
      saveAs: downloadOptions.saveAs,
      language: getLanguage()
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        trackedDownloadId = null;
        hideDownloadProgress();
        videoHint.textContent = response?.error || t("saveFailed");
        return;
      }
      trackedDownloadId = response.downloadId;
      videoHint.textContent = t("saveSubmitted");
    }
  );
});

function showDownloadProgress(label, percent) {
  downloadProgressPanel.hidden = false;
  downloadProgressLabel.textContent = label;
  if (Number.isFinite(percent)) {
    downloadProgress.removeAttribute("data-indeterminate");
    downloadProgress.value = Math.max(0, Math.min(100, percent));
    downloadProgressValue.textContent = `${Math.round(downloadProgress.value)}%`;
  } else {
    downloadProgress.removeAttribute("value");
    downloadProgressValue.textContent = "";
  }
}

function hideDownloadProgress() {
  downloadProgressPanel.hidden = true;
  downloadProgress.value = 0;
  downloadProgressValue.textContent = "0%";
}

function updateDownloadProgress(downloadItem) {
  if (!downloadItem || downloadItem.id !== trackedDownloadId) return;

  if (downloadItem.state === "complete") {
    showDownloadProgress(t("downloadComplete"), 100);
    videoHint.textContent = t("downloadComplete");
    trackedDownloadId = null;
    return;
  }

  if (downloadItem.state === "interrupted") {
    showDownloadProgress(t("downloadInterrupted"), 0);
    videoHint.textContent = t("downloadInterrupted");
    trackedDownloadId = null;
    return;
  }

  const totalBytes = Number(downloadItem.totalBytes);
  const bytesReceived = Number(downloadItem.bytesReceived);
  if (Number.isFinite(totalBytes) && totalBytes > 0 && Number.isFinite(bytesReceived)) {
    const percent = Math.min(99, Math.round((bytesReceived / totalBytes) * 100));
    showDownloadProgress(t("downloadProgress", { percent }), percent);
    return;
  }

  showDownloadProgress(t("downloadProgressUnknown"), NaN);
}

if (chrome.downloads?.onChanged) {
  chrome.downloads.onChanged.addListener((delta) => {
    if (!trackedDownloadId || delta.id !== trackedDownloadId) return;
    chrome.downloads.search({ id: trackedDownloadId }, ([downloadItem]) => {
      updateDownloadProgress(downloadItem);
    });
  });
}

copyVideoUrl.addEventListener("click", async () => {
  const url = currentVideoInfo?.url || currentVideoInfo?.visibleUrl;
  if (!url) return;
  await navigator.clipboard.writeText(url);
  videoHint.textContent = t("urlCopied");
});

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

reset.addEventListener("click", () => {
  saveSettings(DEFAULT_SETTINGS);
});

refreshVideoInfo();

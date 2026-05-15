const DEFAULT_SETTINGS = SPACE_HOLD_DEFAULT_SETTINGS;

const PRESET_RATES = [1.5, 2.0, 2.5, 3.0];

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
const askSaveLocation = document.querySelector("#askSaveLocation");
const shortPressAction = document.querySelector("#shortPressAction");
const presetRates = document.querySelector("#presetRates");
const videoState = document.querySelector("#videoState");
const videoMeta = document.querySelector("#videoMeta");
const videoHint = document.querySelector("#videoHint");
const saveVideo = document.querySelector("#saveVideo");
const copyVideoUrl = document.querySelector("#copyVideoUrl");
const openOptions = document.querySelector("#openOptions");
const reset = document.querySelector("#reset");

let currentSettings = { ...DEFAULT_SETTINGS };
let currentVideoInfo = null;
let pendingSettings = {};
let pendingSettingsTimer = null;

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
  return code || "未设置";
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
  currentSettings = { ...DEFAULT_SETTINGS, ...settings };
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
  askSaveLocation.checked = Boolean(currentSettings.askSaveLocation);
  shortPressAction.value = currentSettings.shortPressAction;
  updatePresetState(currentSettings.holdRate);
}

function setVideoUi(info) {
  currentVideoInfo = info;
  videoState.classList.remove("ready", "warn");

  if (!info || !info.found) {
    videoState.textContent = "未检测到";
    videoState.classList.add("warn");
    videoMeta.textContent = "当前标签页";
    videoHint.textContent = info?.reason || "当前页面暂时没有可保存的视频。";
    saveVideo.disabled = true;
    copyVideoUrl.disabled = true;
    return;
  }

  const duration = formatDuration(info.duration);
  videoMeta.textContent = duration ? `时长 ${duration}` : `当前 ${formatRate(info.playbackRate || 1)}`;
  copyVideoUrl.disabled = !info.visibleUrl;

  if (info.canSave) {
    videoState.textContent = "可保存";
    videoState.classList.add("ready");
    videoHint.textContent = "检测到直链视频，可以保存到本机。";
    saveVideo.disabled = false;
    return;
  }

  videoState.textContent = "受限流";
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
  setVideoUi({ found: false, reason: "正在检测页面视频。" });
  getActiveTab((tab) => {
    if (!tab || !tab.id) {
      setVideoUi({ found: false, reason: "没有可用的当前标签页。" });
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "SPACE_HOLD_VIDEO_INFO" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        setVideoUi({ found: false, reason: "当前页面不支持扩展脚本，或需要刷新页面后再试。" });
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

chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  render({ ...DEFAULT_SETTINGS, ...settings });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    render({ ...DEFAULT_SETTINGS, ...settings });
  });
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

askSaveLocation.addEventListener("change", () => {
  saveSetting("askSaveLocation", askSaveLocation.checked);
});

shortPressAction.addEventListener("change", () => {
  saveSetting("shortPressAction", shortPressAction.value);
});

saveVideo.addEventListener("click", () => {
  if (!currentVideoInfo?.canSave) return;
  chrome.runtime.sendMessage(
    {
      type: "SPACE_HOLD_DOWNLOAD_VIDEO",
      url: currentVideoInfo.url,
      title: currentVideoInfo.pageTitle,
      saveAs: currentSettings.askSaveLocation
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        videoHint.textContent = response?.error || "保存失败，当前网站可能限制了下载。";
        return;
      }
      videoHint.textContent = "已提交到浏览器下载列表。";
    }
  );
});

copyVideoUrl.addEventListener("click", async () => {
  const url = currentVideoInfo?.url || currentVideoInfo?.visibleUrl;
  if (!url) return;
  await navigator.clipboard.writeText(url);
  videoHint.textContent = "视频地址已复制。";
});

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

reset.addEventListener("click", () => {
  saveSettings(DEFAULT_SETTINGS);
});

refreshVideoInfo();

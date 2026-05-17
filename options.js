const DEFAULT_SETTINGS = SPACE_HOLD_DEFAULT_SETTINGS;

const PRESET_RATES = [1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

const controls = {
  language: document.querySelector("#language"),
  enabled: document.querySelector("#enabled"),
  holdRate: document.querySelector("#holdRate"),
  holdRateValue: document.querySelector("#holdRateValue"),
  longPressDelayMs: document.querySelector("#longPressDelayMs"),
  delayValue: document.querySelector("#delayValue"),
  seekStepSeconds: document.querySelector("#seekStepSeconds"),
  seekStepValue: document.querySelector("#seekStepValue"),
  speedHoldKey: document.querySelector("#speedHoldKey"),
  seekBackwardKey: document.querySelector("#seekBackwardKey"),
  seekForwardKey: document.querySelector("#seekForwardKey"),
  enableSeekKeys: document.querySelector("#enableSeekKeys"),
  showBadge: document.querySelector("#showBadge"),
  badgePosition: document.querySelector("#badgePosition"),
  shortPressAction: document.querySelector("#shortPressAction"),
  rememberPageRate: document.querySelector("#rememberPageRate"),
  askSaveLocation: document.querySelector("#askSaveLocation"),
  useDownloadSubfolder: document.querySelector("#useDownloadSubfolder"),
  presetRates: document.querySelector("#presetRates"),
  badgePreview: document.querySelector("#badgePreview"),
  save: document.querySelector("#save"),
  reset: document.querySelector("#reset"),
  status: document.querySelector("#status")
};

let currentSettings = { ...DEFAULT_SETTINGS };
let statusTimer = null;
let recordingKey = null;
let pendingSettings = null;
let pendingSettingsTimer = null;

function formatRate(value) {
  return `${Number(value).toFixed(1)}x`;
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
  document.title = t("pageTitleOptions");
}

function setStatus(text) {
  window.clearTimeout(statusTimer);
  controls.status.textContent = text;
  statusTimer = window.setTimeout(() => {
    controls.status.textContent = "";
  }, 1800);
}

function updatePresetState(value) {
  const rounded = Number(value).toFixed(2);
  controls.presetRates.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.rate === rounded);
  });
}

function updatePreview() {
  controls.badgePreview.textContent = formatRate(currentSettings.holdRate);
  controls.badgePreview.hidden = !currentSettings.showBadge;

  const map = {
    "top-right": { top: "64px", right: "18px", bottom: "auto", left: "auto" },
    "top-left": { top: "64px", right: "auto", bottom: "auto", left: "18px" },
    "bottom-right": { top: "auto", right: "18px", bottom: "44px", left: "auto" },
    "bottom-left": { top: "auto", right: "auto", bottom: "44px", left: "18px" }
  };
  Object.assign(controls.badgePreview.style, map[currentSettings.badgePosition] || map["top-right"]);
}

function collectSettings() {
  return {
    language: controls.language.value,
    enabled: controls.enabled.checked,
    holdRate: Number(controls.holdRate.value),
    longPressDelayMs: Number(controls.longPressDelayMs.value),
    seekStepSeconds: Number(controls.seekStepSeconds.value),
    speedHoldKey: currentSettings.speedHoldKey,
    seekBackwardKey: currentSettings.seekBackwardKey,
    seekForwardKey: currentSettings.seekForwardKey,
    enableSeekKeys: controls.enableSeekKeys.checked,
    showBadge: controls.showBadge.checked,
    badgePosition: controls.badgePosition.value,
    shortPressAction: controls.shortPressAction.value,
    rememberPageRate: controls.rememberPageRate.checked,
    askSaveLocation: controls.askSaveLocation.checked,
    useDownloadSubfolder: controls.useDownloadSubfolder.checked
  };
}

function render(settings) {
  currentSettings = { ...DEFAULT_SETTINGS, ...settings };
  applyText();
  controls.language.value = getLanguage();
  controls.enabled.checked = Boolean(currentSettings.enabled);
  controls.holdRate.value = currentSettings.holdRate;
  controls.holdRateValue.textContent = formatRate(currentSettings.holdRate);
  controls.longPressDelayMs.value = currentSettings.longPressDelayMs;
  controls.delayValue.textContent = `${currentSettings.longPressDelayMs}ms`;
  controls.seekStepSeconds.value = currentSettings.seekStepSeconds;
  controls.seekStepValue.textContent = `${currentSettings.seekStepSeconds}s`;
  controls.speedHoldKey.textContent = formatKey(currentSettings.speedHoldKey);
  controls.seekBackwardKey.textContent = formatKey(currentSettings.seekBackwardKey);
  controls.seekForwardKey.textContent = formatKey(currentSettings.seekForwardKey);
  controls.enableSeekKeys.checked = Boolean(currentSettings.enableSeekKeys);
  controls.showBadge.checked = Boolean(currentSettings.showBadge);
  controls.badgePosition.value = currentSettings.badgePosition;
  controls.shortPressAction.value = currentSettings.shortPressAction;
  controls.rememberPageRate.checked = Boolean(currentSettings.rememberPageRate);
  controls.askSaveLocation.checked = Boolean(currentSettings.askSaveLocation);
  controls.useDownloadSubfolder.checked = Boolean(currentSettings.useDownloadSubfolder);
  updatePresetState(currentSettings.holdRate);
  updatePreview();
}

function save(settings, message = "已保存") {
  currentSettings = { ...DEFAULT_SETTINGS, ...settings };
  window.clearTimeout(pendingSettingsTimer);
  pendingSettings = null;
  chrome.storage.sync.set(currentSettings, () => {
    render(currentSettings);
    setStatus(message);
  });
}

function saveFromControls(message) {
  save(collectSettings(), message);
}

function saveSoon(settings) {
  pendingSettings = { ...DEFAULT_SETTINGS, ...settings };
  window.clearTimeout(pendingSettingsTimer);
  pendingSettingsTimer = window.setTimeout(() => {
    const next = pendingSettings;
    pendingSettings = null;
    chrome.storage.sync.set(next);
  }, 180);
}

function buildPresets() {
  controls.presetRates.replaceChildren();
  PRESET_RATES.forEach((rate) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rate = rate.toFixed(2);
    button.textContent = formatRate(rate);
    button.addEventListener("click", () => {
      controls.holdRate.value = rate;
      saveFromControls(t("statusRateUpdated"));
    });
    controls.presetRates.appendChild(button);
  });
}

buildPresets();

chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  render(settings);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    render(settings);
  });
});

[
  controls.enabled,
  controls.language,
  controls.holdRate,
  controls.longPressDelayMs,
  controls.seekStepSeconds,
  controls.showBadge,
  controls.badgePosition,
  controls.shortPressAction,
  controls.rememberPageRate,
  controls.enableSeekKeys,
  controls.askSaveLocation,
  controls.useDownloadSubfolder
].forEach((control) => {
  control.addEventListener("input", () => {
    const settings = collectSettings();
    render(settings);
    saveSoon(settings);
  });
});

document.querySelectorAll("[data-key-setting]").forEach((button) => {
  button.addEventListener("click", () => {
    recordingKey = button.dataset.keySetting;
    document.querySelectorAll("[data-key-setting]").forEach((item) => {
      item.classList.toggle("recording", item === button);
    });
    button.textContent = t("pressAKey");
  });
});

window.addEventListener("keydown", (event) => {
  if (!recordingKey) return;
  event.preventDefault();
  event.stopPropagation();
  const next = collectSettings();
  next[recordingKey] = event.code;
  recordingKey = null;
  document.querySelectorAll("[data-key-setting]").forEach((item) => {
    item.classList.remove("recording");
  });
  save(next, t("statusShortcutUpdated"));
}, true);

controls.save.addEventListener("click", () => {
  saveFromControls(t("statusSaved"));
});

controls.reset.addEventListener("click", () => {
  save(DEFAULT_SETTINGS, t("statusReset"));
});

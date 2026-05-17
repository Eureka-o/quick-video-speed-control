const SPACE_HOLD_DEFAULT_SETTINGS = {
  language: "en",
  enabled: true,
  holdRate: 2.0,
  longPressDelayMs: 180,
  showBadge: true,
  badgePosition: "top-right",
  shortPressAction: "pause",
  rememberPageRate: true,
  downloadLocationMode: "ask",
  speedHoldKey: "Space",
  seekBackwardKey: "ArrowLeft",
  seekForwardKey: "ArrowRight",
  seekStepSeconds: 5,
  enableSeekKeys: true
};

function normalizeSpaceHoldSettings(values = {}) {
  const settings = { ...SPACE_HOLD_DEFAULT_SETTINGS, ...values };

  if (!values.downloadLocationMode) {
    if (values.askSaveLocation === true) {
      settings.downloadLocationMode = "ask";
    } else if (values.useDownloadSubfolder === true) {
      settings.downloadLocationMode = "subfolder";
    } else if (values.askSaveLocation === false || values.useDownloadSubfolder === false) {
      settings.downloadLocationMode = "downloads";
    } else {
      settings.downloadLocationMode = SPACE_HOLD_DEFAULT_SETTINGS.downloadLocationMode;
    }
  }

  if (!["ask", "downloads", "subfolder"].includes(settings.downloadLocationMode)) {
    settings.downloadLocationMode = SPACE_HOLD_DEFAULT_SETTINGS.downloadLocationMode;
  }

  delete settings.askSaveLocation;
  delete settings.useDownloadSubfolder;

  return settings;
}

function getSpaceHoldDownloadOptions(settings) {
  const normalized = normalizeSpaceHoldSettings(settings);
  return {
    saveAs: normalized.downloadLocationMode === "ask",
    useDownloadSubfolder: normalized.downloadLocationMode === "subfolder"
  };
}

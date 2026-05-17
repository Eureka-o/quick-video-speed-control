(function () {
  const DEFAULT_SETTINGS = SPACE_HOLD_DEFAULT_SETTINGS;

  let settings = { ...DEFAULT_SETTINGS };
  let holdKeyDown = false;
  let holdTimer = null;
  let pendingVideo = null;
  let activeVideo = null;
  let originalRate = null;
  let holdActive = false;
  let badge = null;
  let seekBadgeTimer = null;

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      settings = { ...DEFAULT_SETTINGS, ...stored };
    });
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    return (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      target.isContentEditable
    );
  }

  function getHoldRate() {
    const rate = Number(settings.holdRate);
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SETTINGS.holdRate;
  }

  function getLongPressDelayMs() {
    const delay = Number(settings.longPressDelayMs);
    return Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_SETTINGS.longPressDelayMs;
  }

  function getSeekStepSeconds() {
    const seconds = Number(settings.seekStepSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_SETTINGS.seekStepSeconds;
  }

  function getSpeedHoldKey() {
    return settings.speedHoldKey || DEFAULT_SETTINGS.speedHoldKey;
  }

  function isConfiguredKey(event, key) {
    return event.code === key;
  }

  function getBadgePositionStyles() {
    const position = settings.badgePosition || DEFAULT_SETTINGS.badgePosition;
    const base = {
      top: "auto",
      right: "auto",
      bottom: "auto",
      left: "auto",
      transform: "translateY(-4px)"
    };

    if (position === "top-left") {
      return { ...base, top: "20px", left: "20px", transform: "translateY(-4px)" };
    }
    if (position === "bottom-left") {
      return { ...base, bottom: "20px", left: "20px", transform: "translateY(4px)" };
    }
    if (position === "bottom-right") {
      return { ...base, right: "20px", bottom: "20px", transform: "translateY(4px)" };
    }
    return { ...base, top: "20px", right: "20px", transform: "translateY(-4px)" };
  }

  function applyBadgePosition(hidden) {
    if (!badge) return;
    const styles = getBadgePositionStyles();
    badge.style.top = styles.top;
    badge.style.right = styles.right;
    badge.style.bottom = styles.bottom;
    badge.style.left = styles.left;
    badge.style.transform = hidden ? styles.transform : "translateY(0)";
  }

  function findBestVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    if (!videos.length) return null;

    const playing = videos.find((video) => {
      return !video.paused && !video.ended && video.readyState > 1;
    });
    if (playing) return playing;

    return videos
      .filter((video) => video.readyState > 0)
      .sort((a, b) => {
        const areaA = a.clientWidth * a.clientHeight;
        const areaB = b.clientWidth * b.clientHeight;
        return areaB - areaA;
      })[0] || null;
  }

  function absolutizeUrl(url) {
    if (!url) return "";
    try {
      return new URL(url, window.location.href).href;
    } catch (error) {
      return url;
    }
  }

  function isDirectVideoUrl(url) {
    if (!url || url.startsWith("blob:") || url.startsWith("data:")) return false;
    try {
      const parsed = new URL(url, window.location.href);
      return /^https?:$/.test(parsed.protocol);
    } catch (error) {
      return false;
    }
  }

  function getVideoSources(video) {
    if (!video) return [];
    const sources = [];
    const current = absolutizeUrl(video.currentSrc || video.src);
    if (current) sources.push(current);
    video.querySelectorAll("source[src]").forEach((source) => {
      const src = absolutizeUrl(source.getAttribute("src"));
      if (src) sources.push(src);
    });
    return Array.from(new Set(sources));
  }

  function getVideoInfo() {
    const language = getSpaceHoldLanguage(settings.language);
    const video = findBestVideo();
    if (!video) {
      return {
        found: false,
        canSave: false,
        reason: spaceHoldTranslate(language, "contentNoVideo")
      };
    }

    const sources = getVideoSources(video);
    const directUrl = sources.find(isDirectVideoUrl) || "";
    const blockedSource = sources.find((source) => source.startsWith("blob:") || source.startsWith("data:")) || "";
    const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;

    return {
      found: true,
      canSave: Boolean(directUrl),
      url: directUrl,
      visibleUrl: directUrl || blockedSource || "",
      reason: directUrl
        ? spaceHoldTranslate(language, "contentDirectVideo")
        : spaceHoldTranslate(language, "contentRestricted"),
      paused: video.paused,
      playbackRate: video.playbackRate || 1,
      duration,
      pageTitle: document.title || "video"
    };
  }

  function ensureBadge() {
    if (badge) return badge;
    badge = document.createElement("div");
    badge.textContent = `${getHoldRate()}x`;
    badge.style.cssText = [
      "position: fixed",
      "z-index: 2147483647",
      "padding: 8px 12px",
      "border-radius: 8px",
      "background: rgba(17, 24, 39, 0.88)",
      "color: white",
      "font: 600 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      "box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2)",
      "pointer-events: none",
      "opacity: 0",
      "transition: opacity 120ms ease, transform 120ms ease"
    ].join(";");
    document.documentElement.appendChild(badge);
    applyBadgePosition(true);
    return badge;
  }

  function showBadge() {
    if (!settings.showBadge) return;
    const node = ensureBadge();
    node.textContent = `${getHoldRate()}x`;
    node.style.opacity = "1";
    applyBadgePosition(false);
  }

  function showTemporaryBadge(text) {
    if (!settings.showBadge) return;
    const node = ensureBadge();
    node.textContent = text;
    node.style.opacity = "1";
    applyBadgePosition(false);
    window.clearTimeout(seekBadgeTimer);
    seekBadgeTimer = window.setTimeout(() => {
      if (!holdActive) hideBadge();
    }, 650);
  }

  function hideBadge() {
    if (!badge) return;
    badge.style.opacity = "0";
    applyBadgePosition(true);
  }

  function blockSpaceEvent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function startSpeedHold(video) {
    if (!settings.enabled || activeVideo) return;
    if (!video || video.paused || video.ended) return;

    activeVideo = video;
    originalRate = settings.rememberPageRate ? video.playbackRate || 1 : 1;
    holdActive = true;
    video.playbackRate = getHoldRate();
    showBadge();
  }

  function clearKeyState() {
    clearTimeout(holdTimer);
    holdTimer = null;
    holdKeyDown = false;
    pendingVideo = null;
  }

  function stopSpeedHold() {
    clearKeyState();

    if (activeVideo && originalRate !== null) {
      activeVideo.playbackRate = originalRate;
    }
    activeVideo = null;
    originalRate = null;
    holdActive = false;
    hideBadge();
  }

  function seekVideo(direction) {
    if (!settings.enabled || !settings.enableSeekKeys) return false;
    const video = findBestVideo();
    if (!video || !Number.isFinite(video.duration)) return false;

    const step = getSeekStepSeconds();
    const targetTime = Math.min(Math.max(video.currentTime + direction * step, 0), video.duration);
    video.currentTime = targetTime;
    showTemporaryBadge(`${direction > 0 ? "+" : "-"}${step}s`);
    return true;
  }

  function onKeyDown(event) {
    if (isTypingTarget(event.target)) return;

    if (settings.enableSeekKeys && isConfiguredKey(event, settings.seekBackwardKey || DEFAULT_SETTINGS.seekBackwardKey)) {
      if (seekVideo(-1)) blockSpaceEvent(event);
      return;
    }

    if (settings.enableSeekKeys && isConfiguredKey(event, settings.seekForwardKey || DEFAULT_SETTINGS.seekForwardKey)) {
      if (seekVideo(1)) blockSpaceEvent(event);
      return;
    }

    if (!isConfiguredKey(event, getSpeedHoldKey())) return;
    if (event.repeat || holdKeyDown) {
      if (holdKeyDown || holdActive) blockSpaceEvent(event);
      return;
    }

    const video = findBestVideo();
    if (!settings.enabled || !video || video.paused || video.ended) return;

    blockSpaceEvent(event);
    holdKeyDown = true;
    pendingVideo = video;
    holdTimer = window.setTimeout(() => {
      startSpeedHold(pendingVideo);
    }, getLongPressDelayMs());
  }

  function onKeyUp(event) {
    if (!isConfiguredKey(event, getSpeedHoldKey())) return;
    if (!holdKeyDown && !holdActive) return;

    blockSpaceEvent(event);
    if (holdActive) {
      stopSpeedHold();
      return;
    }

    const video = pendingVideo;
    clearKeyState();
    if (settings.shortPressAction === "none") return;
    if (video && !video.paused && !video.ended) {
      video.pause();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) stopSpeedHold();
  }

  loadSettings();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "SPACE_HOLD_VIDEO_INFO") return false;
    sendResponse(getVideoInfo());
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, change] of Object.entries(changes)) {
      settings[key] = change.newValue;
    }
    if (!settings.enabled) {
      stopSpeedHold();
      return;
    }
    if (activeVideo) {
      activeVideo.playbackRate = getHoldRate();
      if (settings.showBadge) {
        showBadge();
      } else {
        hideBadge();
      }
    }
    if (badge) applyBadgePosition(!holdActive);
  });

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", stopSpeedHold, true);
  document.addEventListener("visibilitychange", onVisibilityChange, true);
})();

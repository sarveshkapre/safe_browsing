(() => {
  "use strict";

  const COOKIE_CONTEXT_PATTERN =
    /(cookie|cookies|consent|gdpr|ccpa|privacy|tracking|personalized ads|do not sell)/i;

  const REJECT_PATTERNS = [
    /reject/i,
    /decline/i,
    /deny/i,
    /disallow/i,
    /refuse/i,
    /only necessary/i,
    /necessary only/i,
    /essential only/i,
    /continue without/i,
    /save choices/i,
    /confirm choices/i
  ];

  const CLOSE_PATTERNS = [
    /^x$/i,
    /close/i,
    /dismiss/i,
    /hide/i
  ];

  const ACCEPT_PATTERNS = [
    /accept/i,
    /agree/i,
    /allow all/i,
    /yes,? i agree/i
  ];

  const BANNER_SELECTORS = [
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    "#qc-cmp2-ui",
    "#qc-cmp2-container",
    "#didomi-host",
    ".didomi-popup-container",
    '[id^="sp_message_container_"]',
    ".sp_message_container",
    '[id*="cookie" i]',
    '[class*="cookie" i]',
    '[id*="consent" i]',
    '[class*="consent" i]',
    '[aria-label*="cookie" i]',
    '[aria-label*="consent" i]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    "dialog"
  ];

  const CLICKABLE_SELECTOR = [
    "button",
    "[role='button']",
    "input[type='button']",
    "input[type='submit']",
    "a[href]"
  ].join(",");

  const MAX_SCAN_DURATION_MS = 25000;

  const seenBanners = new WeakSet();
  const handledClickTargets = new WeakSet();

  let featureEnabled = true;
  let paused = false;
  let running = false;
  let scanStartedAt = 0;
  let observer = null;
  let intervalId = null;
  let scanQueued = false;

  function shouldBeEnabled() {
    return featureEnabled && !paused;
  }

  function normalizeText(input) {
    return String(input || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function elementText(el) {
    if (!el) {
      return "";
    }

    const chunks = [
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("value"),
      el.id,
      el.className
    ];

    return normalizeText(chunks.filter(Boolean).join(" "));
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      style.pointerEvents === "none"
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function hasCookieContext(el) {
    if (!el || !(el instanceof Element)) {
      return false;
    }

    if (COOKIE_CONTEXT_PATTERN.test(elementText(el))) {
      return true;
    }

    const parent = el.parentElement;
    if (parent && COOKIE_CONTEXT_PATTERN.test(elementText(parent))) {
      return true;
    }

    const section = el.closest("section,article,aside,div,dialog,form,footer,header");
    return Boolean(section && COOKIE_CONTEXT_PATTERN.test(elementText(section)));
  }

  function isLikelyOverlay(el) {
    if (!el || !(el instanceof Element)) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    const area = rect.width * rect.height;

    const positionHint = style.position === "fixed" || style.position === "sticky";
    const sizeHint = area / viewportArea > 0.12;
    const zIndex = Number.parseInt(style.zIndex || "0", 10);
    const zHint = Number.isFinite(zIndex) && zIndex >= 10;

    return positionHint || sizeHint || zHint;
  }

  function unlockPageScroll() {
    document.documentElement.classList.add("safe-browsing-cookie-unlock");
    document.body?.classList.add("safe-browsing-cookie-unlock");

    for (const root of [document.documentElement, document.body]) {
      if (!root) {
        continue;
      }
      root.style.setProperty("overflow", "auto", "important");
      root.style.setProperty("position", "static", "important");
    }
  }

  function markHandledBanner(el) {
    if (el && el instanceof Element) {
      seenBanners.add(el);
      el.setAttribute("data-safe-browsing-cookie-handled", "1");
    }
  }

  function clickElement(el) {
    if (!el || handledClickTargets.has(el)) {
      return false;
    }

    handledClickTargets.add(el);

    try {
      el.click();
      return true;
    } catch {
      const events = ["pointerdown", "mousedown", "mouseup", "click"];
      for (const eventName of events) {
        el.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
      }
      return true;
    }
  }

  function findButtons(container) {
    if (!container || !(container instanceof Element)) {
      return [];
    }

    return Array.from(container.querySelectorAll(CLICKABLE_SELECTOR)).filter((el) => isVisible(el));
  }

  function pickButton(buttons, patterns) {
    let best = null;

    for (const button of buttons) {
      const text = elementText(button);
      if (!text) {
        continue;
      }

      if (patterns.some((pattern) => pattern.test(text))) {
        if (!best || text.length < elementText(best).length) {
          best = button;
        }
      }
    }

    return best;
  }

  function hideBanner(el) {
    if (!el || seenBanners.has(el)) {
      return false;
    }

    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("opacity", "0", "important");
    el.style.setProperty("pointer-events", "none", "important");

    markHandledBanner(el);
    unlockPageScroll();
    return true;
  }

  function processBanner(banner) {
    if (!banner || seenBanners.has(banner) || !isVisible(banner)) {
      return false;
    }

    if (!hasCookieContext(banner) && !isLikelyOverlay(banner)) {
      return false;
    }

    const buttons = findButtons(banner);

    const rejectButton = pickButton(buttons, REJECT_PATTERNS);
    if (rejectButton && clickElement(rejectButton)) {
      markHandledBanner(banner);
      unlockPageScroll();
      return true;
    }

    const closeButton = pickButton(buttons, CLOSE_PATTERNS);
    if (closeButton && clickElement(closeButton)) {
      markHandledBanner(banner);
      unlockPageScroll();
      return true;
    }

    const hasAcceptOnly = buttons.some((button) => ACCEPT_PATTERNS.some((pattern) => pattern.test(elementText(button))));
    if (hasAcceptOnly || isLikelyOverlay(banner)) {
      return hideBanner(banner);
    }

    return false;
  }

  function collectBannerCandidates() {
    const candidates = new Set();

    for (const selector of BANNER_SELECTORS) {
      let nodes = [];
      try {
        nodes = document.querySelectorAll(selector);
      } catch {
        continue;
      }

      for (const node of nodes) {
        if (node instanceof Element) {
          candidates.add(node);
        }
      }
    }

    return Array.from(candidates);
  }

  function tryGlobalRejectButtons() {
    const buttons = Array.from(document.querySelectorAll(CLICKABLE_SELECTOR)).filter((el) => {
      if (!isVisible(el)) {
        return false;
      }

      const text = elementText(el);
      if (!text || !REJECT_PATTERNS.some((pattern) => pattern.test(text))) {
        return false;
      }

      return hasCookieContext(el);
    });

    for (const button of buttons) {
      if (clickElement(button)) {
        unlockPageScroll();
        return true;
      }
    }

    return false;
  }

  function stopScanning() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    running = false;
  }

  function shouldContinueScanning() {
    if (!shouldBeEnabled()) {
      return false;
    }

    return Date.now() - scanStartedAt <= MAX_SCAN_DURATION_MS;
  }

  function scanNow() {
    if (!shouldContinueScanning()) {
      stopScanning();
      return;
    }

    let handled = tryGlobalRejectButtons();
    const candidates = collectBannerCandidates();

    for (const banner of candidates) {
      handled = processBanner(banner) || handled;
    }

    if (handled) {
      unlockPageScroll();
    }
  }

  function queueScan() {
    if (!shouldBeEnabled() || scanQueued) {
      return;
    }

    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scanNow();
    });
  }

  function startScanning() {
    if (!shouldBeEnabled() || running) {
      return;
    }

    running = true;
    scanStartedAt = Date.now();

    scanNow();
    intervalId = setInterval(scanNow, 900);

    if (document.documentElement) {
      observer = new MutationObserver(queueScan);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "id", "aria-hidden", "aria-modal"]
      });
    }

    window.addEventListener("load", queueScan, { once: true });
  }

  function startWhenReady() {
    if (!shouldBeEnabled()) {
      stopScanning();
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startScanning, { once: true });
      return;
    }

    startScanning();
  }

  function setEnabled(nextEnabled) {
    featureEnabled = nextEnabled !== false;

    if (!shouldBeEnabled()) {
      stopScanning();
      return;
    }

    startWhenReady();
  }

  function setPaused(nextPaused) {
    paused = nextPaused === true;

    if (!shouldBeEnabled()) {
      stopScanning();
      return;
    }

    startWhenReady();
  }

  chrome.storage.local.get({ cookieHandlingEnabled: true, paused: false }, (data) => {
    if (chrome.runtime.lastError) {
      setEnabled(true);
      setPaused(false);
      return;
    }

    setEnabled(data.cookieHandlingEnabled !== false);
    setPaused(data.paused === true);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes.cookieHandlingEnabled) {
      const nextValue = changes.cookieHandlingEnabled.newValue;
      setEnabled(nextValue !== false);
    }

    if (changes.paused) {
      setPaused(changes.paused.newValue === true);
    }
  });
})();

(() => {
  "use strict";

  const SETTINGS_KEY = "xAdsHidingEnabled";
  const HIDDEN_ATTR = "data-safe-browsing-xad-hidden";
  const HIDDEN_ATTR_VALUE = "1";

  const EXACT_PROMO_LABELS = new Set([
    "promoted",
    "sponsored",
    "ad",
    "advertisement"
  ]);

  const TEXT_PATTERNS = [/\bpromoted\b/i, /\bsponsored\b/i, /\bad\b/i];

  let enabled = true;
  let observer = null;
  let scanTimer = null;

  function normalizeText(input) {
    return String(input || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function collectTweetArticles() {
    return Array.from(document.querySelectorAll("article[data-testid='tweet']"));
  }

  function hasExactPromotedLabel(article) {
    const nodes = article.querySelectorAll("span,div,a");
    for (const node of nodes) {
      const text = normalizeText(node.textContent);
      if (EXACT_PROMO_LABELS.has(text)) {
        return true;
      }
    }
    return false;
  }

  function scorePromotedSignals(article) {
    let score = 0;

    if (article.querySelector("a[href*='/i/ads/'], a[href*='ads.twitter.com']")) {
      score += 3;
    }

    if (article.querySelector("[data-testid='placementTracking']")) {
      score += 1;
    }

    if (hasExactPromotedLabel(article)) {
      score += 2;
    }

    const fullText = normalizeText(article.innerText || article.textContent || "");
    if (TEXT_PATTERNS.some((pattern) => pattern.test(fullText))) {
      score += 1;
    }

    return score;
  }

  function findHideTarget(article) {
    return article.closest("[data-testid='cellInnerDiv']") || article;
  }

  function hidePromotedArticle(article) {
    const target = findHideTarget(article);
    if (!target || target.getAttribute(HIDDEN_ATTR) === HIDDEN_ATTR_VALUE) {
      return;
    }

    target.setAttribute(HIDDEN_ATTR, HIDDEN_ATTR_VALUE);
    target.style.setProperty("display", "none", "important");
    target.style.setProperty("visibility", "hidden", "important");
    target.style.setProperty("max-height", "0", "important");
    target.style.setProperty("overflow", "hidden", "important");
    target.style.setProperty("pointer-events", "none", "important");
  }

  function unhideAll() {
    const hidden = document.querySelectorAll(`[${HIDDEN_ATTR}='${HIDDEN_ATTR_VALUE}']`);
    for (const el of hidden) {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
      el.style.removeProperty("max-height");
      el.style.removeProperty("overflow");
      el.style.removeProperty("pointer-events");
    }
  }

  function scanTimeline() {
    if (!enabled) {
      return;
    }

    for (const article of collectTweetArticles()) {
      const score = scorePromotedSignals(article);
      if (score >= 2) {
        hidePromotedArticle(article);
      }
    }
  }

  function startWatcher() {
    if (observer || !enabled) {
      return;
    }

    observer = new MutationObserver(() => {
      scanTimeline();
    });

    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false
      });
    }

    scanTimer = setInterval(scanTimeline, 1200);
    scanTimeline();
  }

  function stopWatcher() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled !== false;

    if (!enabled) {
      stopWatcher();
      unhideAll();
      return;
    }

    startWatcher();
    scanTimeline();
  }

  chrome.storage.local.get({ [SETTINGS_KEY]: true }, (stored) => {
    if (chrome.runtime.lastError) {
      setEnabled(true);
      return;
    }

    setEnabled(stored[SETTINGS_KEY] !== false);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) {
      return;
    }

    setEnabled(changes[SETTINGS_KEY].newValue !== false);
  });
})();

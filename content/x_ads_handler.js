(() => {
  "use strict";

  const HIDE_CLASS = "safe-browsing-x-ad-hidden";
  const STYLE_ID = "safe-browsing-x-ad-style";
  const ARTICLE_SELECTOR = "article[data-testid='tweet'], article";

  const HEADER_MAX_OFFSET = 150;
  const MAX_VERTICAL_GAP_TO_CARET = 42;
  const MIN_HORIZONTAL_GAP_TO_CARET = -24;
  const MAX_HORIZONTAL_GAP_TO_CARET = 220;
  const PERIODIC_SCAN_MS = 1700;

  let enabled = true;
  let observer = null;
  let intervalId = null;
  let scanQueued = false;

  function normalizeText(input) {
    return String(input || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
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

  function ensureHideStyle() {
    if (!document.documentElement || document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HIDE_CLASS} {
        display: none !important;
        visibility: hidden !important;
        max-height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  function removeHideStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
  }

  function unhideAll() {
    const hidden = document.querySelectorAll(`.${HIDE_CLASS}`);
    for (const el of hidden) {
      el.classList.remove(HIDE_CLASS);
      el.removeAttribute("data-safe-browsing-x-ad");
    }
  }

  function getCaretRect(article) {
    const caret = article.querySelector(
      "[data-testid='caret'], button[aria-haspopup='menu'][aria-label*='More' i], button[aria-label*='More' i]"
    );

    if (!caret || !isVisible(caret)) {
      return null;
    }

    return caret.getBoundingClientRect();
  }

  function matchesAdBadgeElement(element, articleRect, tweetTextRect, caretRect) {
    if (!isVisible(element)) {
      return false;
    }

    if (element.closest("[data-testid='tweetText']")) {
      return false;
    }

    if (normalizeText(element.textContent) !== "ad") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 6 || rect.height < 6) {
      return false;
    }

    if (rect.top - articleRect.top > HEADER_MAX_OFFSET) {
      return false;
    }

    if (tweetTextRect && rect.top >= tweetTextRect.top - 1) {
      return false;
    }

    const elementCenterY = rect.top + rect.height / 2;
    const caretCenterY = caretRect.top + caretRect.height / 2;
    if (Math.abs(elementCenterY - caretCenterY) > MAX_VERTICAL_GAP_TO_CARET) {
      return false;
    }

    const horizontalGap = caretRect.left - rect.right;
    if (
      horizontalGap < MIN_HORIZONTAL_GAP_TO_CARET ||
      horizontalGap > MAX_HORIZONTAL_GAP_TO_CARET
    ) {
      return false;
    }

    return true;
  }

  function findHeaderAdBadge(article) {
    if (!article.textContent || !article.textContent.includes("Ad")) {
      return null;
    }

    const caretRect = getCaretRect(article);
    if (!caretRect) {
      return null;
    }

    const articleRect = article.getBoundingClientRect();
    const tweetText = article.querySelector("[data-testid='tweetText']");
    const tweetTextRect = tweetText ? tweetText.getBoundingClientRect() : null;

    const walker = document.createTreeWalker(
      article,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return normalizeText(node.nodeValue) === "ad"
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );

    while (walker.nextNode()) {
      const current = walker.currentNode;
      const parent = current && current.parentElement;
      if (!parent || !(parent instanceof Element)) {
        continue;
      }

      if (matchesAdBadgeElement(parent, articleRect, tweetTextRect, caretRect)) {
        return parent;
      }
    }

    return null;
  }

  function hideAdArticle(article) {
    if (!(article instanceof Element) || article.classList.contains(HIDE_CLASS)) {
      return false;
    }

    article.classList.add(HIDE_CLASS);
    article.setAttribute("data-safe-browsing-x-ad", "1");
    return true;
  }

  function scanNow() {
    if (!enabled) {
      return;
    }

    ensureHideStyle();

    const articles = document.querySelectorAll(ARTICLE_SELECTOR);
    for (const article of articles) {
      if (!(article instanceof Element) || article.classList.contains(HIDE_CLASS)) {
        continue;
      }

      const badge = findHeaderAdBadge(article);
      if (badge) {
        hideAdArticle(article);
      }
    }
  }

  function queueScan() {
    if (!enabled || scanQueued) {
      return;
    }

    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scanNow();
    });
  }

  function startScanning() {
    if (!enabled) {
      return;
    }

    scanNow();

    if (!observer && document.documentElement) {
      observer = new MutationObserver(queueScan);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    if (!intervalId) {
      intervalId = setInterval(scanNow, PERIODIC_SCAN_MS);
    }

    window.addEventListener("load", queueScan, { once: true });
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
  }

  function startWhenReady() {
    if (!enabled) {
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startScanning, { once: true });
      return;
    }

    startScanning();
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled !== false;

    if (!enabled) {
      stopScanning();
      unhideAll();
      removeHideStyle();
      return;
    }

    startWhenReady();
  }

  chrome.storage.local.get({ xAdsBlockingEnabled: true }, (data) => {
    if (chrome.runtime.lastError) {
      setEnabled(true);
      return;
    }

    setEnabled(data.xAdsBlockingEnabled !== false);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.xAdsBlockingEnabled) {
      return;
    }

    setEnabled(changes.xAdsBlockingEnabled.newValue !== false);
  });
})();

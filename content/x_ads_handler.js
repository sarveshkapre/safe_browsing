(() => {
  "use strict";

  const SETTINGS_KEY = "xAdsHidingEnabled";
  const HIDDEN_ATTR = "data-safe-browsing-xad-hidden";
  const HIDDEN_ATTR_VALUE = "1";

  const EXACT_PROMO_LABELS = new Set([
    "promoted",
    "sponsored",
    "promocionado",
    "patrocinado",
    "gesponsert",
    "sponsorisé",
    "sponsorizzato",
    "реклама",
    "sponsrad",
    "sponsored post"
  ]);

  const PROMO_LABEL_PATTERNS = [
    /\bpromoted\b/i,
    /\bsponsored\b/i,
    /\bpromocionado\b/i,
    /\bpatrocinado\b/i,
    /\bgesponsert\b/i,
    /\bsponsorisé\b/i,
    /\bsponsorizzato\b/i,
    /\bреклама\b/i,
    /\b赞助\b/i,
    /\bスポンサー\b/i
  ];

  const AD_LINK_SELECTORS = [
    "a[href*='/i/ads/']",
    "a[href*='ads.twitter.com']",
    "a[href*='business.twitter.com']"
  ].join(",");

  const MAX_PROMO_RATIO = 0.35;
  const MIN_TWEETS_FOR_RATIO_GUARD = 6;

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

  function isLikelyPromoLabel(text) {
    if (!text) {
      return false;
    }

    if (EXACT_PROMO_LABELS.has(text)) {
      return true;
    }

    return PROMO_LABEL_PATTERNS.some((pattern) => pattern.test(text));
  }

  function hasPromotedLabel(article) {
    const nodes = article.querySelectorAll("span, a, div");

    for (const node of nodes) {
      const text = normalizeText(node.textContent);
      if (!text || text.length > 28) {
        continue;
      }

      if (isLikelyPromoLabel(text)) {
        return true;
      }

      const ariaLabel = normalizeText(node.getAttribute("aria-label"));
      if (ariaLabel && ariaLabel.length <= 40 && isLikelyPromoLabel(ariaLabel)) {
        return true;
      }
    }

    return false;
  }

  function hasAdLink(article) {
    return Boolean(article.querySelector(AD_LINK_SELECTORS));
  }

  function hasPlacementSignal(article) {
    return Boolean(article.querySelector("[data-testid='placementTracking']"));
  }

  function isPromotedArticle(article) {
    const hasLabel = hasPromotedLabel(article);
    if (hasLabel) {
      return true;
    }

    // Conservative fallback: require both ad-link and placement signal.
    return hasAdLink(article) && hasPlacementSignal(article);
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

    const articles = collectTweetArticles();
    if (!articles.length) {
      return;
    }

    const promoted = [];
    for (const article of articles) {
      if (isPromotedArticle(article)) {
        promoted.push(article);
      }
    }

    // Safety guard: if heuristic claims too many tweets are promoted, skip hiding.
    if (
      articles.length >= MIN_TWEETS_FOR_RATIO_GUARD &&
      promoted.length / articles.length > MAX_PROMO_RATIO
    ) {
      return;
    }

    for (const article of promoted) {
      hidePromotedArticle(article);
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

const annoyancesToggle = document.getElementById("toggle-annoyances");
const regionalToggle = document.getElementById("toggle-regional");
const rulesetStatus = document.getElementById("ruleset-status");

const refreshButton = document.getElementById("refresh");
const clearAllButton = document.getElementById("clear-all");
const status = document.getElementById("status");
const allowlistContainer = document.getElementById("allowlist");

let isApplyingRulesetState = false;

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response" });
    });
  });
}

function setStatus(text, isError) {
  status.textContent = text;
  status.className = isError ? "sub error" : "sub";
}

function setRulesetStatus(text, isError) {
  rulesetStatus.textContent = text;
  rulesetStatus.className = isError ? "sub error" : "sub";
}

function applyRulesetUI(optionalRulesets) {
  isApplyingRulesetState = true;
  annoyancesToggle.checked = optionalRulesets.annoyances === true;
  regionalToggle.checked = optionalRulesets.regional === true;
  isApplyingRulesetState = false;
}

async function loadRulesetSettings() {
  const response = await sendMessage({ type: "GET_RULESET_SETTINGS" });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to load rulesets", true);
    return;
  }

  const optionalRulesets = response.optionalRulesets || {
    annoyances: false,
    regional: false
  };

  applyRulesetUI(optionalRulesets);
  setRulesetStatus(
    `Annoyances: ${optionalRulesets.annoyances ? "on" : "off"} | Regional: ${optionalRulesets.regional ? "on" : "off"}`,
    false
  );
}

async function setOptionalRuleset(ruleset, enabled) {
  const response = await sendMessage({
    type: "SET_OPTIONAL_RULESET",
    ruleset,
    enabled
  });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to update ruleset", true);
    return;
  }

  applyRulesetUI(response.optionalRulesets || {});
  await loadRulesetSettings();
}

async function removeDomain(domain) {
  const response = await sendMessage({
    type: "REMOVE_ALLOWLIST_DOMAIN",
    domain
  });

  if (!response.ok) {
    setStatus(response.error || "Failed to remove domain", true);
    return;
  }

  setStatus(`Allowlisted sites: ${response.allowlistCount}`, false);
  await loadAllowlist();
}

function renderAllowlist(domains) {
  allowlistContainer.innerHTML = "";

  if (!domains.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No allowlisted sites.";
    allowlistContainer.appendChild(empty);
    return;
  }

  domains.forEach((domain) => {
    const row = document.createElement("li");

    const domainSpan = document.createElement("span");
    domainSpan.className = "domain";
    domainSpan.textContent = domain;

    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      removeDomain(domain).catch((error) => setStatus(String(error), true));
    });

    row.appendChild(domainSpan);
    row.appendChild(removeButton);
    allowlistContainer.appendChild(row);
  });
}

async function loadAllowlist() {
  const response = await sendMessage({ type: "GET_ALLOWLIST" });

  if (!response.ok) {
    setStatus(response.error || "Failed to load allowlist", true);
    return;
  }

  renderAllowlist(response.allowlist || []);
  setStatus(`Allowlisted sites: ${response.allowlistCount || 0}`, false);
}

annoyancesToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setOptionalRuleset("annoyances", annoyancesToggle.checked);
});

regionalToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setOptionalRuleset("regional", regionalToggle.checked);
});

refreshButton.addEventListener("click", () => {
  loadAllowlist().catch((error) => setStatus(String(error), true));
});

clearAllButton.addEventListener("click", async () => {
  const response = await sendMessage({ type: "CLEAR_ALLOWLIST" });

  if (!response.ok) {
    setStatus(response.error || "Failed to clear allowlist", true);
    return;
  }

  await loadAllowlist();
});

Promise.all([loadRulesetSettings(), loadAllowlist()]).catch((error) => {
  setStatus(String(error), true);
  setRulesetStatus(String(error), true);
});

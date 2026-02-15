const refreshButton = document.getElementById("refresh");
const clearAllButton = document.getElementById("clear-all");
const status = document.getElementById("status");
const allowlistContainer = document.getElementById("allowlist");

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

loadAllowlist().catch((error) => setStatus(String(error), true));

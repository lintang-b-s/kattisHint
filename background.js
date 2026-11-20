const write = (sev, data) => console.log(`${new Date()} [${sev}] Kattis Hint Giver (bg): ${data}`);
const log = {
  info: (data) => write("INFO", data),
  warn: (data) => write("WARN", data),
  error: (data) => write("ERROR", data)
};

// Source page listing all hints, filtered to Kattis only.
const HINTS_SOURCE_URL = "https://cpbook.net/methodstosolve?oj=kattis";

const fetchHintsHTML = async () => {
  log.info(`Fetching hint source from ${HINTS_SOURCE_URL}`);
  let response;
  try {
    response = await fetch(HINTS_SOURCE_URL, { credentials: "omit" });
  } catch (networkErr) {
    // This is the case that usually gets swallowed. Common causes:
    // - HINTS_SOURCE_URL not listed in "host_permissions" in manifest.json
    // - DNS/CORS/network failure
    // - typo in the URL
    throw new Error(`Network-level fetch failure for ${HINTS_SOURCE_URL}: ${networkErr.message}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch hints: HTTP ${response.status} ${response.statusText} from ${HINTS_SOURCE_URL}`);
  }
  const html = await response.text();
  if (!html || html.length === 0) {
    throw new Error("Fetched hint source but got an empty response body.");
  }
  // TEMP DEBUG: confirms whether the page still uses the ".Kattis" class
  // that kattis.js's parse() function looks for. Remove once confirmed.
  log.info(`Fetched ${html.length} chars. Contains '.Kattis'-class hint? ${html.includes('class="Kattis"') || html.includes("class='Kattis'")}`);
  return html;
};

const updateHintCache = async () => {
  const html = await fetchHintsHTML();
  await chrome.storage.local.set({
    updated: Date.now(),
    data: html
  });
  log.info(`Hint cache updated and saved to chrome.storage.local (${html.length} chars).`);
  return { ok: true };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === "updateHints") {
    updateHintCache()
      .then((result) => sendResponse(result))
      .catch((err) => {
        // Log loudly here AND send the message text back to the caller,
        // since this console (the service worker's) is easy to miss.
        // View it via chrome://extensions -> Kattis Hint Giver -> "service worker" link.
        log.error(`Failed to update hint cache: ${err.message}`);
        sendResponse({ ok: false, error: err.message });
      });
    // Return true to indicate we'll respond asynchronously.
    return true;
  }
  return false;
});

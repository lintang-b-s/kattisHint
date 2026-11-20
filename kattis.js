const write = (sev, data) => console.log(`${new Date()} [${sev}] Kattis Hint Giver: ${data}`);
const log = {
  info: (data) => write("INFO", data),
  warn: (data) => write("WARN", data),
  error: (data) => write("ERROR", data)
}
const toDOM = (htmlString) => {
  const template = document.createElement('template');
  template.innerHTML = htmlString.trim();
  return template.content.firstChild;
}
const insertAfter = (referenceNode, newNode) => referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling)
const parse = (html) => {
  let results = {};
  new DOMParser()
    .parseFromString(html, "text/html")
    .querySelectorAll(".Kattis")
    .forEach((hint) => {
      const title = hint.children[0].innerText;
      const category = hint.children[2].innerText;
      const fullHint = hint.children[3].innerText;
      results[title] = {
        "category": category,
        "fullHint": fullHint
      }
    })
  const count = Object.keys(results).length;
  if (count === 0) {
    log.warn("Parsed the methodstosolve page but found 0 '.Kattis' elements — the page markup on cpbook.net likely no longer matches this selector. Inspect the fetched HTML in the background service worker console to find the current row/class structure.");
  } else {
    log.info(`Loaded ${count} items from methodstosolve.`)
  }
  return results;
}
const readCache = () => {
  let oneMonthAgo = new Date();
  oneMonthAgo = oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  return chrome.storage.local.get({
    'updated': 0,
    'data': null
  }).then(cache => {
    if (!cache["updated"]) {
      throw new Error("Hint cache not found or not usable.")
    }
    log.info(`Cache found. Last updated: ${cache["updated"]}. Must not be older than: ${oneMonthAgo}`)
    if (cache["updated"] < oneMonthAgo) {
      throw new Error("Hint cache outdated.")
    }
    return cache
  })
}
const checkHints = () => {
  return readCache()
    .then(hint => {
      log.info("Hint cache is up to date.")
      return hint
    })
    .catch((ex) => {
      log.warn(`Caught exception while checking hints: ${ex}... Refreshing hint cache.`)
      return requestHintUpdate()
    })
}
const requestHintUpdate = () => {
  return chrome.runtime.sendMessage('updateHints')
    .then((response) => {
      if (!response || response.ok === false) {
        // Surface the real reason instead of a bare "false", and stop
        // here instead of re-reading a cache that was never written.
        const reason = response && response.error ? response.error : "no response from background worker";
        throw new Error(`Background hint update failed: ${reason}`);
      }
      log.info("Hint cache updated successfully. Re-loading cache...")
      return readCache()
    })
};
const drawListing = (hints) => {
  console.log("Drawing on listing")
  const headerRow = document.querySelector(".table2 > thead > tr :nth-last-child(3)");
  if (!headerRow) {
    log.warn("Could not find listing table header — Kattis markup may have changed.");
    return;
  }
  const tableHeader = `
  <th class="table-item-autofit">
    <a href="#">Category</a>
  </th>
  `
  insertAfter(headerRow, toDOM(tableHeader))
  document.querySelectorAll(".table2 > tbody > tr").forEach((row) => {
    const problem = row.querySelector("td:nth-of-type(1) > a").getAttribute("href").split("/")[2];
    const hint = hints[problem]
    let cellData = `<td></td>`
    if (hint) {
      cellData = `<td>${hint["category"]}</td>`
    }
    insertAfter(row.querySelector("td:nth-last-of-type(3)"), toDOM(cellData))
  })
}
const drawProblem = (hints, problem) => {
  console.log("Drawing on problem")
  // Kattis' current problem-view page renders metadata as a grid of
  // ".card" elements inside "#editor-container .metadata-grid",
  // not the older ".metadata_list" structure. Target that instead.
  const grid = document.querySelector("#editor-container .metadata-grid");
  if (!grid) {
    log.warn("Could not find metadata grid — Kattis markup may have changed.");
    return;
  }
  const hint = hints[problem]
  const category = hint ? hint["category"] : "Not Available"
  const fullHint = hint ? `
  <details class="spoiler" style="--hidden: '${hint["fullHint"]}'">
    <summary>Show Spoiler</summary>
    <div>${hint["fullHint"]}</div>
  </details>
  ` : "Not Available"

  const categoryCard = `
    <div class="card my-0 gap-3 metadata-category-card">
      <i class="fas fa-tag text-3xl self-center" style="color: #ced5e4;"></i>
      <div class="flex flex-col gap-2 self-center">
        <span class="info_label">Category</span>
        <span class="text-lg font-bold text-link">${category}</span>
      </div>
    </div>
  `
  const hintCard = `
    <div class="card my-0 metadata-hint-card">
      <div class="flex flex-col gap-3">
        <span class="info_label">Hint</span>
        ${fullHint}
      </div>
    </div>
  `
  grid.insertAdjacentHTML("beforeend", categoryCard)
  grid.insertAdjacentHTML("beforeend", hintCard)
}
const drawHints = (hints) => {
  // If we're here, we can be sure we're on *.kattis.com on an actual window
  // so window.location will exist.
  const pagePath = window.location.pathname.split("/")
  if (pagePath.length === 2 && pagePath[1] === "problems") {
    // Assume that we are on main problem listing page: https://*.kattis.com/problems
    drawListing(hints)
  } else if (pagePath.length === 3 && pagePath[1] === "problems") {
    // Assume that we are on an individual problem page: https://*.kattis.com/problems/10kindsofpeople
    const problem = pagePath[2]
    drawProblem(hints, problem)
  }
  // Else... I don't know where I am! Let's not destroy the UI.
}
// Trying to re-use code here but Chrome makes it hard to do so across
// background service-worker vs when on *.kattis.com
// Thus, using window !== undefined to judge whether the page is running
// on background service worker vs actual window.
if (typeof window !== "undefined") {
  checkHints()
    .then(cache => parse(cache["data"]))
    .then(hints => drawHints(hints))
    .catch((ex) => log.error(`Failed to draw hints: ${ex}`))
}

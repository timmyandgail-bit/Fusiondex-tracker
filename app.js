const DATA_URL = "assets/fusiondex-data.json";
const LIVE_URL = "assets/owned-live.json";
const STORAGE_KEY = "fusiondex-tracker-progress-v1";
const DB_NAME = "fusiondex-file-access";
const DB_STORE = "handles";
const SAVE_HANDLE_KEY = "save-folder";

const state = {
  dex: [],
  live: { fusions: {}, generatedAt: null, source: null },
  liveMode: "none",
  progress: { seen: {}, caught: {}, favorite: {} },
  query: "",
  filter: "all",
  sort: "id"
};

const els = {
  grid: document.querySelector("#grid"),
  search: document.querySelector("#searchInput"),
  filter: document.querySelector("#statusFilter"),
  sort: document.querySelector("#sortSelect"),
  datasetInfo: document.querySelector("#datasetInfo"),
  caughtCount: document.querySelector("#caughtCount"),
  seenCount: document.querySelector("#seenCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  totalCount: document.querySelector("#totalCount"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  connectSaveBtn: document.querySelector("#connectSaveBtn"),
  saveInfo: document.querySelector("#saveInfo"),
  clearBtn: document.querySelector("#clearBtn"),
  template: document.querySelector("#cardTemplate")
};

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) state.progress = saved;
  } catch {
    state.progress = { seen: {}, caught: {}, favorite: {} };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function openHandleDb() {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
  return idbRequest(request);
}

async function saveFolderHandle(handle) {
  const db = await openHandleDb();
  const tx = db.transaction(DB_STORE, "readwrite");
  tx.objectStore(DB_STORE).put(handle, SAVE_HANDLE_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getFolderHandle() {
  const db = await openHandleDb();
  const tx = db.transaction(DB_STORE, "readonly");
  return idbRequest(tx.objectStore(DB_STORE).get(SAVE_HANDLE_KEY));
}

function value(obj, key, fallback = null) {
  return obj?.ivars?.[key] ?? fallback;
}

function cleanText(input) {
  if (input instanceof Uint8Array) return new TextDecoder().decode(input);
  return input == null ? "" : String(input);
}

function pokemonRecord(mon, location) {
  const speciesData = value(mon, "@species_data");
  const body = value(speciesData, "@body_pokemon");
  const head = value(speciesData, "@head_pokemon");
  const bodyId = value(body, "@id_number");
  const headId = value(head, "@id_number");
  const record = {
    name: cleanText(value(speciesData, "@real_name") || value(mon, "@species")),
    nickname: cleanText(value(mon, "@name")),
    level: value(mon, "@level", "?"),
    location,
    personalId: value(mon, "@personalID"),
    shiny: Boolean(value(mon, "@shiny", false))
  };
  if (headId && bodyId) {
    record.fusionId = `${headId}.${bodyId}`;
    record.head = headId;
    record.body = bodyId;
  } else {
    record.speciesId = value(speciesData, "@id_number");
  }
  return record;
}

function addLiveRecord(fusions, record) {
  if (!record.fusionId) return;
  const item = fusions[record.fusionId] || { count: 0, locations: [], pokemon: [] };
  item.count += 1;
  if (!item.locations.includes(record.location)) item.locations.push(record.location);
  item.pokemon.push(record);
  fusions[record.fusionId] = item;
}

function extractSaveOwnership(save, source) {
  const fusions = {};
  const pokemon = [];
  const party = value(save.player, "@party", []);
  party.forEach((mon, index) => {
    if (!mon) return;
    const record = pokemonRecord(mon, `Party ${index + 1}`);
    pokemon.push(record);
    addLiveRecord(fusions, record);
  });

  const boxes = value(save.storage_system, "@boxes", []);
  boxes.forEach((box, boxIndex) => {
    const boxName = cleanText(value(box, "@name")) || `Box ${boxIndex + 1}`;
    value(box, "@pokemon", []).forEach((mon, slotIndex) => {
      if (!mon) return;
      const record = pokemonRecord(mon, `${boxName} Slot ${slotIndex + 1}`);
      pokemon.push(record);
      addLiveRecord(fusions, record);
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    source,
    pokemonCount: pokemon.length,
    fusionCount: Object.keys(fusions).length,
    fusions,
    pokemon
  };
}

async function readSaveFromFolder(folderHandle, fileName = "File A.rxdata") {
  const fileHandle = await folderHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const save = window.RMarshal.load(await file.arrayBuffer());
  state.live = extractSaveOwnership(save, file.name);
  state.liveMode = "browser";
  const liveDate = new Date(state.live.generatedAt).toLocaleTimeString();
  els.saveInfo.textContent = `Connected to ${file.name} · ${state.live.pokemonCount} Pokemon · ${state.live.fusionCount} fusions · ${liveDate}`;
  render();
}

async function connectSaveFolder() {
  if (!window.showDirectoryPicker) {
    els.saveInfo.textContent = "Folder sync needs Chrome or Edge. Firefox/Safari can still use manual progress.";
    return;
  }
  const handle = await window.showDirectoryPicker({ mode: "read" });
  await saveFolderHandle(handle);
  await readSaveFromFolder(handle);
}

async function restoreSaveFolder() {
  if (!window.showDirectoryPicker) return;
  const handle = await getFolderHandle().catch(() => null);
  if (!handle) return;
  const permission = await handle.queryPermission({ mode: "read" });
  if (permission === "granted" || await handle.requestPermission({ mode: "read" }) === "granted") {
    await readSaveFromFolder(handle).catch(() => {
      els.saveInfo.textContent = "Saved folder permission found, but File A.rxdata was not readable.";
    });
  }
}

function setFlag(type, id, value) {
  state.progress[type][id] = value;
  if (!value) delete state.progress[type][id];
  if (type === "caught" && value) state.progress.seen[id] = true;
  saveProgress();
  render();
}

function isCaught(id) {
  return Boolean(state.progress.caught[id] || state.live.fusions[id]);
}

function isSeen(id) {
  return Boolean(state.progress.seen[id] || isCaught(id));
}

function filteredDex() {
  const q = state.query.trim().toLowerCase();
  const rows = state.dex.filter((item) => {
    const id = item.id;
    if (state.filter === "caught" && !isCaught(id)) return false;
    if (state.filter === "seen" && !isSeen(id)) return false;
    if (state.filter === "missing" && isCaught(id)) return false;
    if (state.filter === "favorite" && !state.progress.favorite[id]) return false;
    if (!q) return true;
    return [
      item.id,
      item.head,
      item.body,
      item.entry,
      item.author
    ].join(" ").toLowerCase().includes(q);
  });

  rows.sort((a, b) => {
    if (state.sort === "artist") return a.author.localeCompare(b.author) || a.sort - b.sort;
    if (state.sort === "entries") return b.entryCount - a.entryCount || a.sort - b.sort;
    return a.sort - b.sort;
  });
  return rows;
}

function renderSummary() {
  els.totalCount.textContent = state.dex.length.toLocaleString();
  const caught = new Set([...Object.keys(state.progress.caught), ...Object.keys(state.live.fusions)]);
  const seen = new Set([...Object.keys(state.progress.seen), ...caught]);
  els.caughtCount.textContent = caught.size.toLocaleString();
  els.seenCount.textContent = seen.size.toLocaleString();
  els.favoriteCount.textContent = Object.keys(state.progress.favorite).length.toLocaleString();
}

function ensureLiveRows() {
  const existing = new Set(state.dex.map((item) => item.id));
  const additions = Object.entries(state.live.fusions || {})
    .filter(([id]) => !existing.has(id))
    .map(([id, live]) => {
      const [head, body] = id.split(".").map(Number);
      const first = live.pokemon?.[0] || {};
      return {
        id,
        head,
        body,
        sort: head * 1000 + body,
        entry: "Owned in this save, but no written dex entry was found in the current public dex data.",
        author: first.name || "live save sync",
        entryCount: 0,
        liveOnly: true
      };
    });
  if (additions.length) {
    state.dex = [...state.dex, ...additions].sort((a, b) => a.sort - b.sort);
  }
}

function render() {
  ensureLiveRows();
  renderSummary();
  const rows = filteredDex();
  els.grid.innerHTML = "";

  if (!rows.length) {
    els.grid.innerHTML = '<p class="empty">No fusions match those filters.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of rows.slice(0, 500)) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const live = state.live.fusions[item.id];
    node.classList.toggle("is-seen", isSeen(item.id));
    node.classList.toggle("is-caught", isCaught(item.id));
    node.classList.toggle("is-favorite", Boolean(state.progress.favorite[item.id]));
    node.querySelector(".fusion-id").textContent = `#${item.id}`;
    node.querySelector(".entry-count").textContent = item.liveOnly
      ? "Live save-only fusion"
      : `${item.entryCount} dex entr${item.entryCount === 1 ? "y" : "ies"}`;
    node.querySelector(".entry").textContent = item.entry;
    node.querySelector(".artist").textContent = live
      ? `${live.count} owned · ${live.locations.slice(0, 3).join(", ")}`
      : `Entry by ${item.author || "unknown artist"}`;
    node.querySelector(".favorite").textContent = state.progress.favorite[item.id] ? "★" : "☆";
    node.querySelector(".seen").addEventListener("click", () => setFlag("seen", item.id, !state.progress.seen[item.id]));
    node.querySelector(".caught").addEventListener("click", () => setFlag("caught", item.id, !state.progress.caught[item.id]));
    node.querySelector(".favorite").addEventListener("click", () => setFlag("favorite", item.id, !state.progress.favorite[item.id]));
    fragment.append(node);
  }

  els.grid.append(fragment);
  if (rows.length > 500) {
    const note = document.createElement("p");
    note.className = "empty";
    note.textContent = `Showing 500 of ${rows.length.toLocaleString()} matches. Search or filter to narrow it down.`;
    els.grid.append(note);
  }
}

function exportProgress() {
  const blob = new Blob([JSON.stringify({
    app: "FusionDex Tracker",
    exportedAt: new Date().toISOString(),
    progress: state.progress
  }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "fusiondex-progress.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importProgress(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  state.progress = data.progress || data;
  saveProgress();
  render();
}

async function boot() {
  loadProgress();
  const response = await fetch(DATA_URL);
  const payload = await response.json();
  state.dex = payload.fusions;
  els.datasetInfo.textContent = `Dataset ${payload.version} · updated ${new Date(payload.generatedAt).toLocaleDateString()} · ${payload.source}`;
  await loadLiveOwnership();
  await restoreSaveFolder();
  render();
  setInterval(loadLiveOwnership, 5000);
  setInterval(async () => {
    const handle = await getFolderHandle().catch(() => null);
    if (handle) readSaveFromFolder(handle).catch(() => {});
  }, 5000);
}

async function loadLiveOwnership() {
  if (state.liveMode === "browser") return;
  try {
    const response = await fetch(`${LIVE_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    state.live = payload;
    state.liveMode = "file";
    const liveDate = payload.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString() : "unknown time";
    els.datasetInfo.textContent = `Live save sync active · ${Object.keys(payload.fusions || {}).length.toLocaleString()} caught fusions · updated ${liveDate}`;
    render();
  } catch {
    // Hosted copies will not have a local live file until the sync helper is running.
  }
}

els.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});
els.filter.addEventListener("change", (event) => {
  state.filter = event.target.value;
  render();
});
els.sort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});
els.exportBtn.addEventListener("click", exportProgress);
els.importInput.addEventListener("change", (event) => {
  if (event.target.files[0]) importProgress(event.target.files[0]);
});
els.connectSaveBtn.addEventListener("click", () => {
  connectSaveFolder().catch((error) => {
    els.saveInfo.textContent = `Save sync was not connected: ${error.message}`;
  });
});
els.clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all tracked progress on this browser?")) return;
  state.progress = { seen: {}, caught: {}, favorite: {} };
  saveProgress();
  render();
});

boot().catch(() => {
  els.datasetInfo.textContent = "Could not load dex data. Open this through a local server or publish the folder online.";
});

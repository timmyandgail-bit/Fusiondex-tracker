// FusionDex Tracker — app logic
// Reads File A.rxdata via File System Access API, polls it for changes,
// extracts caught/seen species + current party + PC boxes, and stores
// progress in browser localStorage (private per-device).

const STATE_KEY = 'fusiondex_state_v1';
const POLL_MS = 4000;

let fileHandle = null;
let lastFileSize = -1;
let lastModified = -1;
let pollTimer = null;

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  els.connectBtn = document.getElementById('connect-save');
  els.status = document.getElementById('sync-status');
  els.caughtCount = document.getElementById('caught-count');
  els.seenCount = document.getElementById('seen-count');
  els.partyList = document.getElementById('party-list');
  els.boxList = document.getElementById('box-list');
  els.exportBtn = document.getElementById('export-btn');
  els.importBtn = document.getElementById('import-btn');
  els.importInput = document.getElementById('import-input');
  els.clearBtn = document.getElementById('clear-progress');

  els.connectBtn.addEventListener('click', connectSave);
  els.exportBtn.addEventListener('click', exportProgress);
  els.importBtn.addEventListener('click', () => els.importInput.click());
  els.importInput.addEventListener('change', importProgress);
  els.clearBtn.addEventListener('click', clearProgress);

  if (!('showOpenFilePicker' in window)) {
    els.status.textContent = 'Your browser doesn\'t support live file watching (needs Chrome or Edge). You can still use Export/Import.';
    els.connectBtn.disabled = true;
  }

  renderFromState(loadState());
});

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : defaultState();
  } catch (e) {
    return defaultState();
  }
}

function defaultState() {
  return {
    caughtSpecies: [],
    seenSpecies: [],
    party: [],
    boxes: [],
    lastSync: null
  };
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

async function connectSave() {
  try {
    const [handle] = await window.showOpenFilePicker({
      excludeAcceptAllOption: false
    });
    fileHandle = handle;
    els.status.textContent = `Watching ${handle.name}…`;
    await syncOnce();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkForChanges, POLL_MS);
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error(e);
      els.status.textContent = `Could not open file [${e.name}]: ${e.message}`;
    }
  }
}

async function checkForChanges() {
  if (!fileHandle) return;
  try {
    const file = await fileHandle.getFile();
    if (file.size !== lastFileSize || file.lastModified !== lastModified) {
      await syncOnce();
    }
  } catch (e) {
    els.status.textContent = 'Lost access to save file — click Connect Save again.';
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function syncOnce() {
  const file = await fileHandle.getFile();
  lastFileSize = file.size;
  lastModified = file.lastModified;
  const buf = await file.arrayBuffer();

  let parsed;
  try {
    parsed = window.RMarshal.parseMarshal(buf);
  } catch (e) {
    console.error('Marshal parse failed', e);
    els.status.textContent = 'Could not read save file (unsupported format or corrupted).';
    return;
  }

  const result = extractTrainerData(parsed);
  if (!result) {
    els.status.textContent = 'Save read, but expected Trainer/Pokedex data was not found. Check the browser console (F12) for a diagnostic dump.';
    console.warn('=== FusionDex diagnostic dump ===');
    console.warn('Top-level type:', describeNode(parsed));
    console.warn('All classes found in save tree:', Array.from(collectClasses(parsed)).sort());
    console.warn('Raw top-level node (expand to inspect):', parsed);
    return;
  }

  const state = loadState();
  mergeCaughtSeen(state, result);
  state.party = result.party;
  state.boxes = result.boxes;
  state.lastSync = new Date().toISOString();
  saveState(state);
  renderFromState(state);
  els.status.textContent = `Synced ${new Date().toLocaleTimeString()}`;
}

// --- Save data extraction -------------------------------------------------

function extractTrainerData(rootHash) {
  if (!(rootHash instanceof Map)) return null;

  const trainer = rootHash.get(':player');
  if (!trainer) return null;

  const pokedex = window.RMarshal.rget(trainer, 'pokedex');
  const ownedArr = pokedex ? window.RMarshal.rget(pokedex, 'owned_standard') : null;
  const seenArr = pokedex ? window.RMarshal.rget(pokedex, 'seen_standard') : null;

  const caughtSpecies = arrayToIndices(ownedArr);
  const seenSpecies = arrayToIndices(seenArr);

  const partyArr = window.RMarshal.rget(trainer, 'party') || [];
  const party = partyArr.map(pokemonToSnapshot).filter(Boolean);

  const storage = rootHash.get(':storage_system');
  let boxes = [];
  if (storage) {
    const boxArr = window.RMarshal.rget(storage, 'boxes') || [];
    boxArr.forEach((box, i) => {
      const slots = window.RMarshal.rget(box, 'pokemon') || [];
      if (Array.isArray(slots)) {
        slots.forEach(p => {
          const snap = pokemonToSnapshot(p);
          if (snap) boxes.push({ ...snap, box: i });
        });
      }
    });
  }

  return { caughtSpecies, seenSpecies, party, boxes };
}

function arrayToIndices(boolArray) {
  if (!Array.isArray(boolArray)) return [];
  const out = [];
  boolArray.forEach((v, i) => { if (v) out.push(i); });
  return out;
}

function pokemonToSnapshot(p) {
  if (!p || !p.ivars) return null;
  const species = window.RMarshal.rget(p, 'species');
  if (species === undefined) return null;
  const fusedData = window.RMarshal.rget(p, 'species_data');
  let fusionHead = null, fusionBody = null;
  if (fusedData && fusedData.ivars) {
    const head = window.RMarshal.rget(fusedData, 'head_pokemon');
    fusionHead = head !== undefined ? head : null;
    const body = window.RMarshal.rget(fusedData, 'body_pokemon');
    fusionBody = body !== undefined ? body : null;
  }
  const nickname = window.RMarshal.rget(p, 'name') || null;
  const level = window.RMarshal.rget(p, 'level') || null;
  return { species, fusionHead, fusionBody, nickname, level };
}

function describeNode(node) {
  if (node === null || node === undefined) return 'null';
  if (Array.isArray(node)) return `Array(${node.length})`;
  if (node instanceof Map) return `Hash(${node.size} keys) — keys: ${Array.from(node.keys()).map(k => typeof k === 'string' ? k : describeNode(k)).slice(0, 20).join(', ')}`;
  if (typeof node === 'object' && node.__rtype === 'object') return `Object<${(node.__class || '').replace(/^:/, '')}> ivars: ${Object.keys(node.ivars || {}).join(', ')}`;
  if (typeof node === 'object' && node.__rtype) return `${node.__rtype}<${(node.__class || '').replace(/^:/, '')}>`;
  return typeof node;
}

function collectClasses(node, seen = new Set(),

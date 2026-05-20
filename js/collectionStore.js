// js/collectionStore.js
//
// IndexedDB persistence for the user's active collection.
// Single "active" slot for v1 — multi-collection management is v1.1+.
//
// Stored payload shape:
//   { rows, source: 'user' | 'demo', updatedAt: ISO-string }

const DB_NAME = "dvdshelf";
const DB_VERSION = 1;
const STORE = "collections";
const ACTIVE_KEY = "active";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadActiveCollection() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const result = await reqP(tx.objectStore(STORE).get(ACTIVE_KEY));
    await txDone(tx);
    return result ?? null;
  } catch (err) {
    console.warn("[collectionStore] load failed:", err);
    return null;
  }
}

export async function saveActiveCollection(rows, source = "user") {
  const payload = { rows, source, updatedAt: new Date().toISOString() };
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(payload, ACTIVE_KEY);
    await txDone(tx);
    return true;
  } catch (err) {
    console.warn("[collectionStore] save failed:", err);
    return false;
  }
}

export async function clearActiveCollection() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(ACTIVE_KEY);
    await txDone(tx);
    return true;
  } catch (err) {
    console.warn("[collectionStore] clear failed:", err);
    return false;
  }
}

export async function hasUserCollection() {
  const c = await loadActiveCollection();
  return c?.source === "user";
}

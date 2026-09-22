/** Reprise locale isolée par compte, ville et version ; aucune donnée envoyée ailleurs. */
const memory = new Map();
let database;
const open = () => {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('op-diagnostic-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  return database;
};

export const draftKey = (userId, city, id) => `${userId || 'anonymous'}:${city}:${id}`;

export async function readDraft(key) {
  if (memory.has(key)) return structuredClone(memory.get(key));
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction('drafts').objectStore('drafts').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

export async function writeDraft(key, dossier) {
  const copy = structuredClone(dossier);
  memory.set(key, copy);
  const db = await open();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put(copy, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

export async function removeDraft(key) {
  memory.delete(key);
  const db = await open();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').delete(key);
    tx.oncomplete = tx.onerror = tx.onabort = resolve;
  });
}

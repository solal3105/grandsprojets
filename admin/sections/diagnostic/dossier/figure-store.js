/* Les images de cartes d'un dossier sont rangées dans le compartiment privé
   « diagnostic », sous <ville>/figures/, et nommées par l'empreinte de leur
   contenu. Une version enregistrée ne garde que leur emplacement : elle ne
   recopie plus 10 à 13 Mo d'images en base, et les versions successives d'un
   même dossier partagent les mêmes fichiers. En mémoire et dans le brouillon
   local, le dossier garde ses images en data URL, comme avant : l'affichage,
   l'impression et le PDF ne changent pas. Un dépôt qui échoue laisse l'image
   dans la version, qui reste ainsi complète. Les fichiers ne sont pas supprimés
   avec une version, puisque d'autres versions peuvent les utiliser. */

const DATA_URL = /^data:(image\/(?:jpeg|png));base64,([a-z0-9+/=]+)$/i;
const FIGURE_PATH = /^([a-z0-9-]+)\/figures\/[0-9a-f]{64}\.(jpg|png)$/;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const TYPES = { jpg: 'image/jpeg', png: 'image/png' };

function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Exécute les tâches avec au plus `limit` en parallèle. */
async function pool(tasks, limit) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]();
  });
  await Promise.all(workers);
}

/** Emplacement d'une image, s'il appartient bien au dossier de cette ville. */
export function figurePath(figure, city) {
  const match = FIGURE_PATH.exec(String(figure?.path || ''));
  return match && match[1] === city ? figure.path : null;
}

/**
 * Dépose les images encore absentes du compartiment et note leur emplacement.
 * @param {Object} dossier - modifié en place (figure.path)
 * @param {(path: string, blob: Blob) => Promise<unknown>} upload - lève une erreur si le dépôt échoue
 * @returns {Promise<{stored: number, failed: number}>}
 */
export async function storeFigures(dossier, upload, { concurrency = 4 } = {}) {
  let stored = 0, failed = 0;
  const pending = Object.values(dossier?.figures || {}).filter((figure) => DATA_URL.test(figure?.url || '') && !figurePath(figure, dossier.city));
  await pool(pending.map((figure) => async () => {
    try {
      const [, type, base64] = DATA_URL.exec(figure.url);
      const bytes = decode(base64);
      const path = `${dossier.city}/figures/${await sha256(bytes)}.${EXTENSIONS[type.toLowerCase()]}`;
      await upload(path, new Blob([bytes], { type: type.toLowerCase() }));
      figure.path = path; stored++;
    } catch (error) {
      console.warn('[diagnostic/dossier] Image de carte non déposée, elle reste dans la version :', error);
      failed++;
    }
  }), concurrency);
  return { stored, failed };
}

/** Les images rangées dans le compartiment ne sont enregistrées que par leur emplacement. */
export function persistedFigures(figures, city) {
  return Object.fromEntries(Object.entries(figures || {}).map(([key, figure]) => {
    if (!figurePath(figure, city)) return [key, figure];
    const { url: _url, ...rest } = figure;
    return [key, rest];
  }));
}

/**
 * Recharge depuis le compartiment les images d'une version enregistrée.
 * Une image introuvable laisse la carte schématique, comme une figure manquante.
 * @param {Object} dossier - modifié en place (figure.url)
 * @param {(path: string) => Promise<Blob>} download
 * @returns {Promise<{loaded: number, failed: number}>}
 */
export async function loadFigures(dossier, download, { concurrency = 6 } = {}) {
  let loaded = 0, failed = 0;
  const pending = Object.values(dossier?.figures || {}).filter((figure) => figurePath(figure, dossier.city) && !DATA_URL.test(figure.url || ''));
  await pool(pending.map((figure) => async () => {
    try {
      const blob = await download(figure.path);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      figure.url = `data:${TYPES[figure.path.split('.').pop()]};base64,${encode(bytes)}`;
      loaded++;
    } catch (error) {
      console.warn('[diagnostic/dossier] Image de carte indisponible :', error);
      delete figure.url;
      failed++;
    }
  }), concurrency);
  return { loaded, failed };
}

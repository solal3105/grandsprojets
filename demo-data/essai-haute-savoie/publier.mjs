// Dépose les fichiers de l'espace de démonstration essai-haute-savoie dans le stockage.
// Lancement depuis la racine du dépôt : npx netlify dev:exec node demo-data/essai-haute-savoie/publier.mjs
// Il dépose les fichiers, puis écrit les lignes de donnees.json (l'espace est d'abord vidé de ses anciennes lignes).
import { readdir, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const VILLE = 'essai-haute-savoie';
const BASE = 'https://wqqsuybmyqemhojsamgq.supabase.co/storage/v1/object';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente : lancez le script sous « npx netlify dev:exec ».');

const TYPES = { geojson: 'application/json', md: 'text/markdown; charset=utf-8', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml' };
const existe = (p) => access(p).then(() => true, () => false);

async function deposer(bucket, chemin, fichier) {
  const type = TYPES[fichier.split('.').pop()];
  const res = await fetch(`${BASE}/${bucket}/${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'max-age=300' },
    body: await readFile(fichier),
  });
  if (!res.ok) throw new Error(`${bucket}/${chemin} : ${res.status} ${await res.text()}`);
  console.log('déposé', `${bucket}/${chemin}`);
}

for (const f of await readdir(join(ICI, 'projets'))) {
  await deposer('uploads', `demo/${VILLE}/${f}`, join(ICI, 'projets', f));
}
// Couverture : la photo retenue dans couvertures/ si elle existe, sinon la vue aérienne IGN.
for (const f of await readdir(join(ICI, 'couvertures-secours'))) {
  const photo = join(ICI, 'couvertures', f);
  await deposer('uploads', `demo/${VILLE}/${f}`, (await existe(photo)) ? photo : join(ICI, 'couvertures-secours', f));
}
for (const f of await readdir(join(ICI, 'travaux'))) {
  await deposer('travaux-geojson', `${VILLE}/${f}`, join(ICI, 'travaux', f));
}
await deposer('uploads', `layer/${VILLE}/departement.geojson`, join(ICI, 'couches', 'departement.geojson'));
if (await existe(join(ICI, 'logo.png'))) await deposer('uploads', `branding/${VILLE}/logo.png`, join(ICI, 'logo.png'));

// Lignes de la base, par l'API de données avec la clé de service.
const REST = 'https://wqqsuybmyqemhojsamgq.supabase.co/rest/v1';
const entetes = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
async function appel(methode, chemin, corps, prefer) {
  const res = await fetch(`${REST}/${chemin}`, {
    method: methode,
    headers: prefer ? { ...entetes, Prefer: `${prefer},return=minimal` } : entetes,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!res.ok) throw new Error(`${methode} ${chemin} : ${res.status} ${await res.text()}`);
}
const donnees = JSON.parse(await readFile(join(ICI, 'donnees.json'), 'utf8'));
if (await existe(join(ICI, 'logo.png'))) {
  donnees.city_branding[0].logo_url = `${BASE}/public/uploads/branding/${VILLE}/logo.png`;
}
await appel('POST', 'city_branding?on_conflict=ville', donnees.city_branding, 'resolution=merge-duplicates');
await appel('POST', 'city_modules?on_conflict=ville,module_key', donnees.city_modules, 'resolution=merge-duplicates');
await appel('POST', 'participer_settings?on_conflict=ville', donnees.participer_settings, 'resolution=ignore-duplicates');
for (const table of ['participer_signalements', 'participer_categories', 'participer_statuts', 'city_travaux', 'contribution_uploads', 'category_icons']) {
  await appel('DELETE', `${table}?ville=eq.${VILLE}`);
}
for (const table of ['category_icons', 'contribution_uploads', 'city_travaux', 'participer_statuts', 'participer_categories', 'participer_signalements']) {
  await appel('POST', table, donnees[table]);
  console.log('écrit', table, donnees[table].length);
}
// Un déclencheur de la base remet « approved » à false à l'insertion des chantiers : on les valide ensuite.
await appel('PATCH', `city_travaux?ville=eq.${VILLE}`, { approved: true });
console.log('chantiers validés');
console.log('terminé');

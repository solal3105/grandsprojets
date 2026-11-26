// Dépose les fichiers de l'espace de démonstration essai-haute-savoie dans le stockage.
// Lancement depuis la racine du dépôt : npx netlify dev:exec node demo-data/essai-haute-savoie/publier.mjs
// Les lignes de la base sont écrites à part ; ce script ne fait que les fichiers.
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
console.log('terminé');

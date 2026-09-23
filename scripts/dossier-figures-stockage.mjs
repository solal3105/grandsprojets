/* Range dans le compartiment privé « diagnostic » les images de cartes que les
   versions de dossiers enregistrées avant le 23/09/2026 gardaient en base, puis
   réécrit ces versions avec le seul emplacement de chaque image (même format que
   admin/sections/diagnostic/dossier/figure-store.js). Une version n'est réécrite
   que si toutes ses images ont été déposées puis relues à l'identique ; sinon
   elle reste telle quelle. Une copie de chaque version modifiée est écrite
   avant la réécriture dans le dossier donné par --copie.

   Usage (clé de service injectée par Netlify) :
     npx netlify dev:exec node scripts/dossier-figures-stockage.mjs --copie <dossier> [--appliquer]
   Sans --appliquer, le script compte seulement ce qu'il ferait. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../netlify/functions/lib/http.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--appliquer');
const copies = args[args.indexOf('--copie') + 1];
if (!args.includes('--copie') || !copies) throw new Error('Indiquez un dossier pour les copies : --copie <dossier>');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente : lancez le script sous « npx netlify dev:exec ».');
const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const DATA_URL = /^data:(image\/(?:jpeg|png));base64,([a-z0-9+/=]+)$/i;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png' };
mkdirSync(copies, { recursive: true });

const { data: rows, error } = await db.from('diagnostic_reports').select('id, ville').order('created_at');
if (error) throw error;
const totals = { versions: rows.length, concerned: 0, rewritten: 0, skipped: 0, images: 0, bytesBefore: 0, bytesAfter: 0 };
for (const { id, ville } of rows) {
  const { data: row, error: readError } = await db.from('diagnostic_reports').select('analysis').eq('id', id).single();
  if (readError) { console.warn(id, 'lecture impossible :', readError.message); totals.skipped++; continue; }
  const dossier = row.analysis?.dossier;
  const inline = Object.entries(dossier?.figures || {}).filter(([, figure]) => DATA_URL.test(figure?.url || ''));
  if (!dossier || !inline.length) continue;
  if (dossier.city !== ville || !/^[a-z0-9-]+$/.test(ville)) { console.warn(id, 'ville incohérente, version laissée telle quelle'); totals.skipped++; continue; }
  totals.concerned++;
  const before = JSON.stringify(row.analysis).length;
  const figures = structuredClone(dossier.figures);
  let complete = true;
  for (const [name, figure] of inline) {
    const [, type, base64] = DATA_URL.exec(figure.url);
    const bytes = Buffer.from(base64, 'base64');
    const path = `${ville}/figures/${createHash('sha256').update(bytes).digest('hex')}.${EXTENSIONS[type.toLowerCase()]}`;
    if (apply) {
      const upload = await db.storage.from('diagnostic').upload(path, bytes, { contentType: type.toLowerCase(), upsert: false, cacheControl: '31536000' });
      const duplicate = upload.error && (Number(upload.error.statusCode ?? upload.error.status) === 409 || /already exists|duplicate/i.test(String(upload.error.message || '')));
      if (upload.error && !duplicate) { console.warn(id, name, 'dépôt refusé :', upload.error.message); complete = false; break; }
      // Relecture : la version n'est réécrite que si l'image déposée est identique.
      const check = await db.storage.from('diagnostic').download(path);
      const same = check.data && Buffer.from(await check.data.arrayBuffer()).equals(bytes);
      if (!same) { console.warn(id, name, 'relecture différente ou impossible'); complete = false; break; }
    }
    const { url: _url, ...rest } = figure;
    figures[name] = { ...rest, path };
    totals.images++;
  }
  if (!complete) { totals.skipped++; continue; }
  const analysis = { ...row.analysis, dossier: { ...dossier, figures } };
  const after = JSON.stringify(analysis).length;
  totals.bytesBefore += before; totals.bytesAfter += after;
  if (!apply) continue;
  writeFileSync(join(copies, `${id}.json`), JSON.stringify(row.analysis));
  const { error: writeError } = await db.from('diagnostic_reports').update({ analysis }).eq('id', id);
  if (writeError) { console.warn(id, 'réécriture refusée :', writeError.message); totals.skipped++; continue; }
  totals.rewritten++;
  console.log(id, ville, `${inline.length} images, ${Math.round(before / 1e6 * 10) / 10} Mo -> ${Math.round(after / 1e3)} Ko`);
}
console.log(JSON.stringify({ apply, ...totals, moBefore: Math.round(totals.bytesBefore / 1e5) / 10, moAfter: Math.round(totals.bytesAfter / 1e5) / 10 }));

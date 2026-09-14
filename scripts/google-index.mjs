#!/usr/bin/env node
/**
 * Soumet des adresses a l'API d'indexation de Google (Web Search Indexing API).
 *
 * Le connecteur Search Console ne demande que les autorisations de lecture,
 * il ne peut donc jamais soumettre. Cet outil demande la bonne autorisation
 * et garde son propre jeton, separe de celui du connecteur.
 *
 * Usage :
 *   node scripts/google-index.mjs auth                 autorise (ouvre le navigateur)
 *   node scripts/google-index.mjs submit villes       les pages de villes du plan du site
 *   node scripts/google-index.mjs submit fiches       les fiches projet du plan du site
 *   node scripts/google-index.mjs submit <fichier>     une adresse par ligne (max 200/jour)
 *   node scripts/google-index.mjs status <adresse>     date de derniere soumission
 *   node scripts/google-index.mjs inspect villes      etat d indexation, une ligne par adresse
 *   node scripts/google-index.mjs sitemap             etat du plan du site dans Search Console
 *   node scripts/google-index.mjs sitemap --resoumettre
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

const SECRETS = process.env.GSC_OAUTH_SECRETS_FILE
  || path.join(os.homedir(), '.config', 'gsc', 'client_secrets.json');
const TOKEN_PATH = path.join(os.homedir(), '.config', 'gsc', 'indexing-token.json');
const SCOPE = [
  'https://www.googleapis.com/auth/indexing',
  'https://www.googleapis.com/auth/webmasters',
].join(' ');
const PORT_BASE = Number(process.env.GSC_OAUTH_PORT || 8765);

/** Un client OAuth de bureau accepte n importe quel port sur localhost. */
async function freePort() {
  const net = await import('node:net');
  for (let p = PORT_BASE; p < PORT_BASE + 20; p += 1) {
    const libre = await new Promise((resolve) => {
      const s = net.createServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(p);
    });
    if (libre) return p;
  }
  throw new Error('Aucun port libre pour la page d autorisation');
}

function readClient() {
  if (!fs.existsSync(SECRETS)) throw new Error(`Identifiants introuvables : ${SECRETS}`);
  const raw = JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
  const conf = raw.installed || raw.web || raw;
  if (!conf.client_id || !conf.client_secret) throw new Error('Fichier d identifiants inattendu');
  return {
    id: conf.client_id,
    secret: conf.client_secret,
    kind: raw.installed ? 'application de bureau' : raw.web ? 'application web' : 'inconnu',
    redirects: conf.redirect_uris || [],
  };
}

async function exchange(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Echange de jeton refuse : ${json.error} ${json.error_description || ''}`);
  return json;
}

async function authorize() {
  const client = readClient();
  const PORT = await freePort();
  const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
  console.log(`Client OAuth : ${client.kind}, ecoute sur le port ${PORT}`);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', client.id);
  url.searchParams.set('redirect_uri', REDIRECT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const got = new URL(req.url, `http://localhost:${PORT}`);
      if (!got.pathname.startsWith('/oauth2callback')) { res.writeHead(404).end(); return; }
      const err = got.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(err
        ? `<p>Autorisation refusee : ${err}. Vous pouvez fermer cet onglet.</p>`
        : '<p>Autorisation enregistree. Vous pouvez fermer cet onglet.</p>');
      server.close();
      err ? reject(new Error(err)) : resolve(got.searchParams.get('code'));
    });
    server.listen(PORT, () => {
      console.log('Ouverture du navigateur pour la connexion Google...');
      execFile('open', [url.toString()], () => {});
      console.log('Si rien ne s ouvre, la page d autorisation attend sur le port', PORT);
    });
    setTimeout(() => { server.close(); reject(new Error('Aucune reponse apres 5 minutes')); }, 300000);
  });

  const tok = await exchange({
    code, client_id: client.id, client_secret: client.secret,
    redirect_uri: REDIRECT, grant_type: 'authorization_code',
  });
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tok, null, 2), { mode: 0o600 });
  console.log('Autorisation enregistree.');
  return tok.access_token;
}

async function accessToken() {
  if (!fs.existsSync(TOKEN_PATH)) return authorize();
  const saved = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  if (!saved.refresh_token) return authorize();
  const client = readClient();
  const tok = await exchange({
    client_id: client.id, client_secret: client.secret,
    refresh_token: saved.refresh_token, grant_type: 'refresh_token',
  });
  return tok.access_token;
}

async function call(token, body, method = 'POST', endpoint = 'urlNotifications:publish') {
  // Un GET ne porte pas de corps : la cle `body`, meme a undefined, est refusee
  const options = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (method === 'POST') options.body = JSON.stringify(body);
  const res = await fetch(`https://indexing.googleapis.com/v3/${endpoint}`, options);
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

const SITEMAP = 'https://openprojets.com/sitemap.xml';

async function sitemapUrls(kind) {
  const xml = await (await fetch(SITEMAP)).text();
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (kind === 'villes') return all.filter(u => /\/ville\//.test(u));
  if (kind === 'fiches') return all.filter(u => /\/fiche\//.test(u));
  return all;
}

async function submit(source) {
  const urls = ['villes', 'fiches', 'tout'].includes(source)
    ? await sitemapUrls(source)
    : fs.readFileSync(source, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
  console.log(`${urls.length} adresses a soumettre.`);
  if (urls.length > 200) throw new Error(`${urls.length} adresses : le quota Google est de 200 par jour`);
  const token = await accessToken();
  let ok = 0;
  const failures = [];
  for (const [i, url] of urls.entries()) {
    const r = await call(token, { url, type: 'URL_UPDATED' });
    if (r.ok) { ok += 1; } else {
      failures.push({ url, status: r.status, message: r.json?.error?.message || 'sans detail' });
      if (failures.length === 1) {
        console.error(`\nPremier refus (${r.status}) : ${r.json?.error?.message}`);
        if (r.status === 403 || r.status === 401) break;
      }
    }
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${urls.length} envoyees, ${ok} acceptees`);
    await new Promise(r2 => setTimeout(r2, 120));
  }
  console.log(`\n${ok} adresses acceptees sur ${urls.length}.`);
  if (failures.length) {
    console.log(`${failures.length} refus. Exemples :`);
    failures.slice(0, 5).forEach(f => console.log(`  ${f.status} ${f.url} : ${f.message}`));
  }
  process.exitCode = failures.length ? 1 : 0;
}

async function status(url) {
  const token = await accessToken();
  const r = await call(token, null, 'GET', `urlNotifications/metadata?url=${encodeURIComponent(url)}`);
  console.log(JSON.stringify(r.json, null, 2));
}

const SITE = process.env.GSC_SITE_URL || 'sc-domain:openprojets.com';

async function sitemap(resubmit) {
  const token = await accessToken();
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/sitemaps`;
  const head = { Authorization: `Bearer ${token}` };
  if (resubmit) {
    const put = await fetch(`${base}/${encodeURIComponent(SITEMAP)}`, { method: 'PUT', headers: head });
    console.log(put.ok
      ? 'Plan du site resoumis a Google.'
      : `Resoumission refusee (${put.status}) : ${(await put.json().catch(() => ({}))).error?.message || ''}`);
  }
  const res = await fetch(base, { headers: head });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`Lecture refusee (${res.status}) : ${json.error?.message || ''}`); process.exitCode = 1; return; }
  for (const sm of json.sitemap || []) {
    const pages = (sm.contents || []).map(c => `${c.submitted} ${c.type}`).join(', ') || 'aucune page annoncee';
    console.log(`${sm.path}
  derniere lecture par Google : ${sm.lastDownloaded || 'jamais'}
  derniere soumission : ${sm.lastSubmitted || 'inconnue'}
  contenu : ${pages}
  avertissements : ${sm.warnings || 0}, erreurs : ${sm.errors || 0}, en attente : ${sm.isPending ? 'oui' : 'non'}`);
  }
  if (!(json.sitemap || []).length) console.log('Aucun plan du site declare sur cette propriete.');
}

async function inspect(source) {
  const urls = ['villes', 'fiches', 'tout'].includes(source)
    ? await sitemapUrls(source)
    : fs.readFileSync(source, 'utf8').split('\n').map(s2 => s2.trim()).filter(Boolean);
  const token = await accessToken();
  for (const url of urls) {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE, languageCode: 'fr' }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { console.log(`ERREUR\t${url}\t${res.status} ${j.error?.message || ''}`); continue; }
    const r = j.inspectionResult?.indexStatusResult || {};
    console.log(`${r.coverageState || 'sans reponse'}\t${url}\t${r.lastCrawlTime || ''}`);
    await new Promise(r2 => setTimeout(r2, 150));
  }
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'auth') await authorize();
  else if (cmd === 'submit' && arg) await submit(arg);
  else if (cmd === 'status' && arg) await status(arg);
  else if (cmd === 'inspect' && arg) await inspect(arg);
  else if (cmd === 'sitemap') await sitemap(arg === '--resoumettre');
  else { console.error('Usage : google-index.mjs auth | submit villes|fiches|<fichier> | status <adresse> | sitemap [--resoumettre]'); process.exitCode = 2; }
} catch (e) {
  console.error(`Echec : ${e.message}`);
  process.exitCode = 1;
}

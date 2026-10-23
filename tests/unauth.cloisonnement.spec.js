// @ts-check
/**
 * 0.80 - Cloisonnement des villes et écritures réservées (audit du 11/10/2026).
 *
 * L'état de production relevé le 11/10/2026 (tests/fixtures/cloisonnement-avant.sql)
 * et la migration 20261011230000_cloisonnement_des_villes sont rejoués dans une
 * base PostgreSQL embarquée : aucune donnée réelle n'est lue ni touchée. Chaque
 * requête est jouée sous l'identité d'un compte, puis annulée.
 */
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const USERS = {
  // Compte ouvert par l'inscription publique : le déclencheur lui donne un profil sans ville
  vierge: { id: '00000000-0000-4000-8000-000000000001', role: 'invited', ville: null, email: 'vierge@example.com' },
  contributeur: { id: '00000000-0000-4000-8000-000000000002', role: 'invited', ville: ['besancon'], email: 'contrib@example.com' },
  adminBesancon: { id: '00000000-0000-4000-8000-000000000003', role: 'admin', ville: ['besancon'], email: 'admin-b@example.com' },
  adminLyon: { id: '00000000-0000-4000-8000-000000000004', role: 'admin', ville: ['lyon'], email: 'admin-l@example.com' },
  multi: { id: '00000000-0000-4000-8000-000000000005', role: 'invited', ville: ['besancon', 'lyon'], email: 'multi@example.com' },
  global: { id: '00000000-0000-4000-8000-000000000006', role: 'admin', ville: ['global'], email: 'global@example.com' },
  libre: { id: '00000000-0000-4000-8000-000000000007', role: 'invited', ville: null, email: 'libre@example.com' },
};

async function database({ migrated }) {
  const db = new PGlite();
  await db.exec(readFileSync('tests/fixtures/cloisonnement-avant.sql', 'utf8'));
  for (const u of Object.values(USERS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [u.id, u.email]);
    await db.query('insert into public.profiles (id, role, ville) values ($1, $2, $3)', [u.id, u.role, u.ville]);
  }
  const C = USERS.contributeur.id;
  await db.exec(`
    insert into public.contribution_uploads (id, project_name, category, ville, approved, created_by) values
      (1, 'Tram de Besançon', 'mobilite', 'besancon', true, '${C}'),
      (2, 'Brouillon de Besançon', 'mobilite', 'besancon', false, '${C}'),
      (3, 'Parc de Lyon', 'nature', 'lyon', true, '${USERS.adminLyon.id}'),
      (4, 'Brouillon de Lyon', 'nature', 'lyon', false, '${USERS.adminLyon.id}');
    select setval('public.contribution_uploads_id_seq', 100);
    insert into public.consultation_dossiers (project_name, title, pdf_url, contribution_id) values
      ('Tram de Besançon', 'Dossier tram', 'https://x/1.pdf', 1),
      ('Parc de Lyon', 'Dossier parc', 'https://x/3.pdf', null),
      ('Projet disparu', 'Dossier orphelin', 'https://x/9.pdf', null);
    insert into public.city_modules (ville, module_key, label, icon_class) values
      ('besancon', 'carte', 'Carte', 'fa-solid fa-map'), ('lyon', 'carte', 'Carte', 'fa-solid fa-map');
    insert into public.city_branding (ville, brand_name, primary_color) values ('besancon', 'Besançon', '#123456'), ('lyon', 'Lyon', '#654321');
    insert into public.category_icons (category, ville, icon_class, category_styles) values
      ('mobilite', 'besancon', 'fa-solid fa-bus', '{"color":"#ff0000"}'), ('nature', 'lyon', 'fa-solid fa-tree', '{"color":"#00ff00"}');
    insert into public.ui_toggles (key, label) values ('theme', 'Thème');
    insert into storage.objects (bucket_id, name) values
      ('diagnostic', 'besancon/figures/a.jpg'), ('diagnostic', 'lyon/figures/b.jpg'), ('participer-photos', 'besancon/p.png');
  `);
  if (migrated) await db.exec(readFileSync('supabase/migrations/20261011230000_cloisonnement_des_villes.sql', 'utf8'));
  return db;
}

/** Joue une requête sous l'identité d'un compte (ou sans compte), puis annule tout. */
async function run(db, who, sql, params = []) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${who ? 'authenticated' : 'anon'}`);
    await db.query("select set_config('test.uid', $1, true), set_config('test.role', $2, true)",
      [who ? USERS[who].id : '', who ? 'authenticated' : 'anon']);
    const res = await db.query(sql, params);
    return { ok: true, rows: res.rows, count: res.affectedRows ?? res.rows.length };
  } catch (error) {
    return { ok: false, error: String(error.message) };
  } finally {
    await db.exec('rollback');
  }
}
/** Nombre de lignes réellement touchées (0 si la règle les cache ou si la base refuse). */
const touched = async (db, who, sql, params) => {
  const r = await run(db, who, sql, params);
  return r.ok ? r.count : 0;
};

let avant;
let apres;
test.beforeAll(async () => {
  avant = await database({ migrated: false });
  apres = await database({ migrated: true });
});

test.describe('0.80 - Cloisonnement des villes', () => {
  test('0.80.1 - Avant la migration : un compte vierge écrit partout et lit les fichiers privés', async () => {
    expect(await touched(avant, 'vierge', 'update public.city_modules set label = label')).toBe(2);
    expect(await touched(avant, 'vierge', 'delete from public.consultation_dossiers')).toBe(3);
    expect((await run(avant, 'vierge', "select name from storage.objects where bucket_id in ('diagnostic', 'participer-photos')")).rows).toHaveLength(3);
    expect(await touched(avant, 'adminBesancon', "update public.profiles set ville = array['global'] where id = auth.uid()")).toBe(1);
  });

  test('0.80.2 - Un compte vierge ou un visiteur ne modifie plus rien et ne lit plus les fichiers privés', async () => {
    expect(await touched(apres, 'vierge', 'update public.city_modules set label = label')).toBe(0);
    expect(await touched(apres, 'vierge', 'delete from public.consultation_dossiers')).toBe(0);
    expect(await touched(apres, 'vierge', 'update public.category_icons set icon_class = icon_class')).toBe(0);
    expect((await run(apres, 'vierge', "select name from storage.objects where bucket_id in ('diagnostic', 'participer-photos')")).rows).toHaveLength(0);
    expect((await run(apres, 'vierge', "insert into storage.objects (bucket_id, name, owner) values ('uploads', 'img/cover/x.jpg', auth.uid())")).ok).toBe(false);
    expect((await run(apres, null, "insert into storage.objects (bucket_id, name) values ('image', 'x.pdf')")).ok).toBe(false);
    expect((await run(apres, 'vierge', "insert into public.contribution_uploads (project_name, ville, approved, created_by) values ('x', 'besancon', false, auth.uid())")).ok).toBe(false);
    // Les brouillons ne sont plus publics
    expect((await run(apres, null, 'select id from public.contribution_uploads')).rows.map((r) => r.id).sort()).toEqual([1, 3]);
    expect((await run(apres, null, 'select * from public.get_profiles_with_email()')).ok).toBe(false);
  });

  test('0.80.3 - Un administrateur de ville garde la main sur sa ville et seulement sur elle', async () => {
    const a = 'adminBesancon';
    // Plus d'auto-promotion
    expect(await touched(apres, a, "update public.profiles set ville = array['global'] where id = auth.uid()")).toBe(0);
    // Adresses : lui-même et les personnes de sa ville
    const emails = (await run(apres, a, 'select email from public.get_profiles_with_email()')).rows.map((r) => r.email).sort();
    expect(emails).toEqual(['admin-b@example.com', 'contrib@example.com', 'multi@example.com']);
    // Fiches, catégories, espaces : les siens oui, ceux de Lyon non
    expect(await touched(apres, a, "update public.contribution_uploads set project_name = project_name where ville = 'besancon'")).toBe(2);
    expect(await touched(apres, a, "update public.contribution_uploads set project_name = project_name where ville = 'lyon'")).toBe(0);
    expect(await touched(apres, a, "update public.category_icons set icon_class = icon_class where ville = 'lyon'")).toBe(0);
    expect(await touched(apres, a, "update public.category_icons set icon_class = icon_class where ville = 'besancon'")).toBe(1);
    expect(await touched(apres, a, "delete from public.city_branding where ville = 'lyon'")).toBe(0);
    expect(await touched(apres, a, 'update public.city_modules set label = label')).toBe(0);
    expect(await touched(apres, a, 'update public.ui_toggles set label = label')).toBe(0);
    // Fichiers privés du diagnostic : ceux de sa ville
    expect((await run(apres, a, "select name from storage.objects where bucket_id = 'diagnostic'")).rows.map((r) => r.name)).toEqual(['besancon/figures/a.jpg']);
    // Images de marque : dans sa ville seulement
    expect((await run(apres, a, "insert into storage.objects (bucket_id, name, owner) values ('uploads', 'branding/lyon/logo.png', auth.uid())")).ok).toBe(false);
    expect((await run(apres, a, "insert into storage.objects (bucket_id, name, owner) values ('uploads', 'branding/besancon/logo.png', auth.uid())")).ok).toBe(true);
  });

  test('0.80.4 - Le rôle d\'une personne de plusieurs villes ne change que par le super administrateur', async () => {
    const promote = `update public.profiles set role = 'admin' where id = '${USERS.multi.id}'`;
    expect((await run(apres, 'adminBesancon', promote)).ok).toBe(false);
    expect((await run(apres, 'adminBesancon', `update public.profiles set ville = ville || array['global'] where id = '${USERS.multi.id}'`)).ok).toBe(false);
    expect(await touched(apres, 'adminBesancon', `update public.profiles set role = 'admin' where id = '${USERS.contributeur.id}'`)).toBe(1);
    expect(await touched(apres, 'global', promote)).toBe(1);
  });

  test('0.80.5 - Inviter un compte existant : seulement dans les villes que l\'on administre', async () => {
    const add = (ville) => `select public.add_villes_to_user('LIBRE@example.com', array['${ville}']) as r`;
    expect((await run(apres, 'adminBesancon', add('besancon'))).rows[0].r).toBe('ajoute');
    expect((await run(apres, 'adminBesancon', add('lyon'))).ok).toBe(false);
    expect((await run(apres, 'adminBesancon', add('global'))).ok).toBe(false);
    expect((await run(apres, 'vierge', add('besancon'))).ok).toBe(false);
    expect((await run(apres, null, add('besancon'))).ok).toBe(false);
    expect((await run(apres, 'adminBesancon', "select public.add_villes_to_user('personne@example.com', array['besancon']) as r")).rows[0].r).toBe('introuvable');
  });

  test('0.80.6 - Un contributeur travaille sur ses fiches et leurs documents, pas sur celles des autres', async () => {
    const c = 'contributeur';
    expect((await run(apres, c, 'select id from public.contribution_uploads order by id')).rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(await touched(apres, c, 'update public.contribution_uploads set project_name = project_name')).toBe(2);
    expect(await touched(apres, c, "update public.consultation_dossiers set title = title")).toBe(1);
    expect((await run(apres, c, "insert into public.contribution_uploads (project_name, ville, approved, created_by) values ('x', 'besancon', false, auth.uid())")).ok).toBe(true);
    expect((await run(apres, c, "insert into public.contribution_uploads (project_name, ville, approved, created_by) values ('x', 'lyon', false, auth.uid())")).ok).toBe(false);
    expect((await run(apres, c, "insert into storage.objects (bucket_id, name, owner) values ('uploads', 'img/cover/x.jpg', auth.uid())")).ok).toBe(true);
    // Le super administrateur garde la main partout, documents orphelins compris
    expect(await touched(apres, 'global', 'update public.consultation_dossiers set title = title')).toBe(3);
    expect(await touched(apres, 'global', 'update public.city_modules set label = label')).toBe(2);
  });

  // Signalé par une contre-expertise le 12/10/2026 : un document ancien n'était
  // rattaché à sa fiche que par le nom du projet. Une fiche homonyme créée dans
  // une autre ville ne doit donner aucun droit sur lui.
  test('0.80.6b - Une fiche homonyme ne donne aucun droit sur les documents d\'une autre ville', async () => {
    await apres.exec('begin');
    try {
      await apres.exec('set local role authenticated');
      await apres.query("select set_config('test.uid', $1, true), set_config('test.role', 'authenticated', true)", [USERS.contributeur.id]);
      await apres.query("insert into public.contribution_uploads (project_name, ville, approved, created_by) values ('Parc de Lyon', 'besancon', false, auth.uid())");
      const r = await apres.query("update public.consultation_dossiers set title = 'pirate' where title = 'Dossier parc'");
      expect(r.affectedRows).toBe(0);
    } finally {
      await apres.exec('rollback');
    }
    // Le document ancien a été rattaché à sa fiche : l'administrateur de Lyon le garde
    expect(await touched(apres, 'adminLyon', "update public.consultation_dossiers set title = title where title = 'Dossier parc'")).toBe(1);
    // Un document sans fiche ne se modifie plus que par le super administrateur
    expect(await touched(apres, 'adminLyon', "update public.consultation_dossiers set title = title where title = 'Dossier orphelin'")).toBe(0);
  });

  test('0.80.7 - Une icône ou une couleur porteuse de HTML est refusée par la base', async () => {
    const piege = 'fa-solid"><img src=x onerror=alert(1)>';
    expect((await run(apres, 'adminBesancon', `update public.category_icons set icon_class = $1 where ville = 'besancon'`, [piege])).ok).toBe(false);
    expect((await run(apres, 'adminBesancon', `update public.category_icons set category_styles = '{"color":"red\\" onclick=\\"x"}' where ville = 'besancon'`)).ok).toBe(false);
    expect((await run(apres, 'global', `update public.city_branding set primary_color = 'red;background:url(https://x)' where ville = 'besancon'`)).ok).toBe(false);
    expect((await run(apres, 'global', `update public.city_branding set primary_color = '#abcdef' where ville = 'besancon'`)).ok).toBe(true);
  });
});

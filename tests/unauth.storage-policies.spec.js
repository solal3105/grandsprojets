// @ts-check
/**
 * 0.74 - Qui peut supprimer, déposer ou remplacer un fichier du compartiment public « uploads ».
 *
 * Les politiques de production (relevées le 23/09/2026) et la migration
 * 20260923150000_uploads_suppression_restreinte sont rejouées dans une base
 * PostgreSQL embarquée : aucun fichier réel n'est touché. Les parcours du
 * navigateur qui suppriment réellement des fichiers sont couverts par
 * invited.contributions.spec.js et admin.contributions.spec.js.
 */
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const USERS = {
  contributeur: { id: '00000000-0000-4000-8000-000000000001', role: 'invited', ville: ['test-e2e'] },
  adminVille: { id: '00000000-0000-4000-8000-000000000002', role: 'admin', ville: ['test-e2e'] },
  adminAutreVille: { id: '00000000-0000-4000-8000-000000000003', role: 'admin', ville: ['grenoble'] },
  adminGlobal: { id: '00000000-0000-4000-8000-000000000004', role: 'admin', ville: ['global'] },
};
const FILES = {
  couvertureContributeur: ['img/cover/equipements/couverture-contributeur.jpg', 'contributeur'],
  traceAdmin: ['geojson/projects/equipements/trace-admin.geojson', 'adminVille'],
  ficheAdmin: ['md/projects/equipements/fiche-admin.md', 'adminVille'],
  ancienneFiche: ['markdown/fiche-ancienne.md', 'adminVille'],
  dossierPdf: ['pdfs/projects/equipements/dossier.pdf', 'adminVille'],
  logo: ['branding/test-e2e/logo.png', 'adminVille'],
  coucheDiagnostic: ['diagnostic/test-e2e/couche.geojson.gz', 'adminVille'],
  demo: ['demo/essai-paris/couverture.jpg', null],
};

async function database({ migrated }) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'anon') $$;
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    create table public.profiles (id uuid primary key, role text, ville text[]);
    -- Même définition qu'en production.
    create function public.is_admin_for_ville(ville_param text) returns boolean language plpgsql stable security definer set search_path = public as $$
    declare v_role text; v_villes text[];
    begin
      select role, ville into v_role, v_villes from public.profiles where id = auth.uid();
      if v_role is null or v_role <> 'admin' then return false; end if;
      if 'global' = any(v_villes) then return true; end if;
      return ville_param = any(v_villes);
    end; $$;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    grant select on public.profiles to anon, authenticated;
  `);
  for (const user of Object.values(USERS)) await db.query('insert into public.profiles values ($1, $2, $3)', [user.id, user.role, user.ville]);
  for (const [name, owner] of Object.values(FILES)) await db.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', ['uploads', name, owner ? USERS[owner].id : null]);
  await db.exec(readFileSync('tests/fixtures/storage-uploads-policies.sql', 'utf8'));
  if (migrated) await db.exec(readFileSync('supabase/migrations/20260923150000_uploads_suppression_restreinte.sql', 'utf8'));
  return db;
}

/** Joue une requête sous l'identité d'un compte (ou sans compte), puis annule tout. */
async function as(db, who, sql, params = []) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${who ? 'authenticated' : 'anon'}`);
    await db.query("select set_config('test.uid', $1, true), set_config('test.role', $2, true)", [who ? USERS[who].id : '', who ? 'authenticated' : 'anon']);
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('rollback');
  }
}
const canDelete = async (db, who, file) => (await as(db, who, 'delete from storage.objects where bucket_id = $1 and name = $2 returning name', ['uploads', FILES[file][0]])).length === 1;
const canReplace = async (db, who, file) => (await as(db, who, 'update storage.objects set owner = owner where bucket_id = $1 and name = $2 returning name', ['uploads', FILES[file][0]])).length === 1;
const canUpload = async (db, who, name) => {
  try { await as(db, who, 'insert into storage.objects (bucket_id, name, owner) values ($1, $2, auth.uid())', ['uploads', name]); return true; }
  catch (error) { if (/row-level security/.test(String(error.message))) return false; throw error; }
};

let before, after;
test.beforeAll(async () => { before = await database({ migrated: false }); after = await database({ migrated: true }); });
test.afterAll(async () => { await before?.close(); await after?.close(); });

test.describe('0.74 - Stockage public : suppressions, dépôts et remplacements', () => {
  test('0.74.1 - Avant la migration, un contributeur supprime les fichiers d’un projet qui n’est pas le sien', async () => {
    expect(await canDelete(before, 'contributeur', 'traceAdmin')).toBe(true);
    expect(await canDelete(before, 'contributeur', 'logo')).toBe(true);
    expect(await canDelete(before, 'contributeur', 'coucheDiagnostic')).toBe(true);
    expect(await canReplace(before, 'contributeur', 'traceAdmin')).toBe(true);
    expect(await canUpload(before, null, 'geojson/projects/depot-anonyme.geojson')).toBe(true);
  });

  test('0.74.2 - Un contributeur ne supprime et ne remplace que ses propres fichiers', async () => {
    expect(await canDelete(after, 'contributeur', 'couvertureContributeur')).toBe(true);
    for (const file of ['traceAdmin', 'ficheAdmin', 'ancienneFiche', 'dossierPdf', 'logo', 'coucheDiagnostic', 'demo']) {
      expect(await canDelete(after, 'contributeur', file), file).toBe(false);
    }
    expect(await canReplace(after, 'contributeur', 'couvertureContributeur')).toBe(true);
    expect(await canReplace(after, 'contributeur', 'traceAdmin')).toBe(false);
  });

  test('0.74.3 - Un administrateur supprime les fichiers d’une contribution, et ceux de sa ville seulement quand le chemin la porte', async () => {
    for (const file of ['couvertureContributeur', 'traceAdmin', 'ficheAdmin', 'ancienneFiche', 'dossierPdf', 'logo', 'coucheDiagnostic']) {
      expect(await canDelete(after, 'adminVille', file), file).toBe(true);
    }
    expect(await canDelete(after, 'adminVille', 'demo')).toBe(false);
    // Comme sur la table des contributions, tout administrateur retire les fichiers d'une contribution.
    expect(await canDelete(after, 'adminAutreVille', 'couvertureContributeur')).toBe(true);
    for (const file of ['logo', 'coucheDiagnostic', 'demo']) expect(await canDelete(after, 'adminAutreVille', file), file).toBe(false);
    for (const file of ['logo', 'coucheDiagnostic', 'demo']) expect(await canDelete(after, 'adminGlobal', file), file).toBe(true);
  });

  test('0.74.4 - Sans compte, on ne supprime ni ne dépose plus rien', async () => {
    for (const file of Object.keys(FILES)) expect(await canDelete(after, null, file), file).toBe(false);
    expect(await canUpload(after, null, 'geojson/projects/depot-anonyme.geojson')).toBe(false);
  });

  test('0.74.5 - Les dépôts d’une contribution restent possibles pour un compte connecté', async () => {
    for (const name of ['img/cover/equipements/nouvelle.jpg', 'geojson/projects/equipements/nouveau.geojson', 'md/projects/equipements/nouvelle.md', 'pdfs/projects/equipements/nouveau.pdf']) {
      expect(await canUpload(after, 'contributeur', name), name).toBe(true);
    }
    // L'éditeur d'articles dépose ses images : refusé avant la migration, accepté après.
    expect(await canUpload(before, 'contributeur', 'img/articles/equipements/image.png')).toBe(false);
    expect(await canUpload(after, 'contributeur', 'img/articles/equipements/image.png')).toBe(true);
    expect(await canUpload(after, 'contributeur', 'branding/test-e2e/logo-contributeur.png')).toBe(false);
    expect(await canUpload(after, 'adminVille', 'diagnostic/test-e2e/nouvelle.geojson.gz')).toBe(true);
    expect(await canUpload(after, 'adminAutreVille', 'diagnostic/test-e2e/intrusion.geojson.gz')).toBe(false);
  });
});

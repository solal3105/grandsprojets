// @ts-check
import { test, expect } from '@playwright/test';
import {
  jourDeRelance, echeance, jourDeLaDemo, motifDExclusion, composerRelance,
} from '../netlify/functions/lib/demo-relance.mjs';
import { traiterRelances } from '../netlify/functions/demo-relance-scheduled.mjs';

/**
 * Relance personnelle deux jours ouvrés après une démo.
 *
 * Ni navigateur ni serveur : les modules sont importés directement et `fetch`
 * est remplacé, donc AUCUN message ne part et aucune ligne n'est écrite.
 *
 * Ce qui compte ici : la relance part au bon moment (jours ouvrés, le matin à
 * Paris), une seule fois par adresse, jamais à l'équipe ni à quelqu'un qui n'a
 * pas reçu son lien, et elle a l'air écrite à la main (texte brut, aucun lien).
 *
 * Section : 0.88 - Démo / relance personnelle
 */

// Mercredi 21 octobre 2026, 14 h à Paris (heure d'été, UTC+2)
const MERCREDI = '2026-10-21T12:00:00Z';

test.describe('Démo - calendrier de la relance', () => {
  test('0.88.1 - deux jours ouvrés après la démo, week-end et fériés sautés', () => {
    expect(jourDeRelance(MERCREDI)).toBe('2026-10-23');
    // Vendredi -> mardi, samedi -> mardi
    expect(jourDeRelance('2026-10-23T12:00:00Z')).toBe('2026-10-27');
    expect(jourDeRelance('2026-10-24T12:00:00Z')).toBe('2026-10-27');
    // Le 11 novembre ne compte pas
    expect(jourDeRelance('2026-11-09T12:00:00Z')).toBe('2026-11-12');
    // Une démo à 23 h 30 à Paris compte pour ce jour-là, pas pour le lendemain UTC
    expect(jourDeRelance('2026-10-21T21:30:00Z')).toBe('2026-10-23');
  });

  test('0.88.2 - envoi le matin seulement, un jour ouvré', () => {
    // Vendredi 23, 9 h 17 à Paris
    expect(echeance(MERCREDI, new Date('2026-10-23T07:17:00Z'))).toBe('envoyer');
    // Trop tôt, trop tard, trop tôt dans la semaine
    expect(echeance(MERCREDI, new Date('2026-10-23T06:17:00Z'))).toBe('attendre');
    expect(echeance(MERCREDI, new Date('2026-10-23T11:17:00Z'))).toBe('attendre');
    expect(echeance(MERCREDI, new Date('2026-10-22T07:17:00Z'))).toBe('attendre');
    // Échéance manquée le vendredi : rattrapée le lundi matin, pas le samedi
    expect(echeance(MERCREDI, new Date('2026-10-24T08:17:00Z'))).toBe('attendre');
    expect(echeance(MERCREDI, new Date('2026-10-26T09:17:00Z'))).toBe('envoyer');
    // Au-delà d'une semaine, la relance n'a plus rien de naturel
    expect(echeance(MERCREDI, new Date('2026-10-29T08:17:00Z'))).toBe('perime');
  });

  test('0.88.3 - le jour de la démo est dit comme on le dirait', () => {
    expect(jourDeLaDemo(MERCREDI)).toBe('mercredi');
    expect(jourDeLaDemo('2026-10-21T22:30:00Z')).toBe('jeudi');
  });
});

test.describe('Démo - qui relancer', () => {
  const LEAD = { email: 'elu@mairie-exemple.fr', commune_nom: 'Chenôve', mail_status: 'envoye' };

  test('0.88.4 - un visiteur ordinaire est relancé', () => {
    expect(motifDExclusion(LEAD)).toBeNull();
  });

  test('0.88.5 - équipe, adresses factices, lien jamais reçu, contact déjà établi', () => {
    expect(motifDExclusion({ ...LEAD, email: 'Arnaud@Vazy.app' })).toBe('equipe');
    expect(motifDExclusion({ ...LEAD, email: 'solal.gendrin@gmail.com' })).toBe('equipe');
    expect(motifDExclusion({ ...LEAD, email: 'x@yopmail.com' })).toBe('adresse factice');
    expect(motifDExclusion({ ...LEAD, email: 'a@toto.fr' })).toBe('adresse factice');
    expect(motifDExclusion({ ...LEAD, mail_status: 'echec' })).toBe('premier message non envoye');
    expect(motifDExclusion({ ...LEAD, commune_nom: '' })).toBe('commune inconnue');
    expect(motifDExclusion(LEAD, new Set(['elu@mairie-exemple.fr']))).toBe('nous a deja ecrit');
  });
});

test.describe('Démo - le message de relance', () => {
  test('0.88.6 - le texte validé, sans lien ni marque en signature', () => {
    const { subject, text } = composerRelance({ communeNom: 'Chenôve', creeLe: MERCREDI });
    expect(subject).toBe('Votre carte de Chenôve');
    expect(text).toBe([
      'Bonjour,',
      '',
      'J\'ai vu que vous aviez fait la carte des projets de Chenôve sur Open Projets mercredi, et je suis curieux de savoir ce qui vous a amené à découvrir l\'outil.',
      '',
      'C\'était par simple curiosité, ou vous avez un projet en tête pour Chenôve ?',
      '',
      'Qu\'en avez-vous pensé ?',
      '',
      'Bonne journée,',
      'Solal',
    ].join('\n'));
    expect(text).not.toContain('http');
  });
});

/* ─── La tâche planifiée, base et fournisseur simulés ─── */

const fetchReel = globalThis.fetch;
const ENV = ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY',
  'DEMO_RELANCE_FROM', 'DEMO_RELANCE_REPLY_TO', 'DEMO_RELANCE_BCC'];
const envReel = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

/** Simule PostgREST et Resend ; rend les envois et les mises à jour captés. */
function simuler({ aFaire, dejaRelances = [], contacts = [] }) {
  const envois = [];
  const majs = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const reponse = (corps) => ({ ok: true, status: 200, json: async () => corps, text: async () => '' });
    if (u.host === 'api.resend.com') {
      envois.push(JSON.parse(init.body));
      return reponse({ id: 'faux' });
    }
    if (init.method === 'PATCH') {
      majs.push({ filtre: Object.fromEntries(u.searchParams), patch: JSON.parse(init.body) });
      return reponse([]);
    }
    if (u.pathname.endsWith('/contact_requests')) return reponse(contacts);
    if (u.searchParams.get('followup_status') === 'eq.a_faire') return reponse(aFaire);
    return reponse(dejaRelances);
  };
  return { envois, majs };
}

test.describe('Démo - tâche de relance', () => {
  test.beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-test';
    process.env.RESEND_API_KEY = 'cle-de-test';
    for (const k of ['BREVO_API_KEY', 'DEMO_RELANCE_FROM', 'DEMO_RELANCE_REPLY_TO', 'DEMO_RELANCE_BCC']) delete process.env[k];
  });
  test.afterEach(() => {
    globalThis.fetch = fetchReel;
    for (const [k, v] of Object.entries(envReel)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const VENDREDI_MATIN = new Date('2026-10-23T07:17:00Z');

  test('0.88.7 - une seule relance par adresse, sur la démo la plus récente, en texte brut', async () => {
    const { envois, majs } = simuler({
      aFaire: [
        { id: 'b', email: 'Elu@Mairie.fr ', commune_nom: 'Chenôve', mail_status: 'envoye', created_at: MERCREDI },
        { id: 'a', email: 'elu@mairie.fr', commune_nom: 'Dijon', mail_status: 'envoye', created_at: '2026-10-20T12:00:00Z' },
      ],
    });

    const bilan = await traiterRelances(VENDREDI_MATIN);

    expect(bilan.envoyees).toBe(1);
    expect(envois).toHaveLength(1);
    expect(envois[0].to).toEqual(['Elu@Mairie.fr']);
    expect(envois[0].subject).toBe('Votre carte de Chenôve');
    expect(envois[0].from).toBe('Solal Gendrin <solal@openprojets.com>');
    expect(envois[0].reply_to).toEqual(['solal@vazy.app']);
    expect(envois[0].bcc).toEqual(['solal@vazy.app']);
    // Un message écrit à la main n'a pas de version HTML
    expect(envois[0].html).toBeUndefined();
    expect(majs[0].filtre.id).toBe('eq.b');
    expect(majs[0].patch.followup_status).toBe('envoye');
    expect(majs[1].filtre.id).toBe('in.(a)');
    expect(majs[1].patch).toEqual({ followup_status: 'ignore', followup_reason: 'doublon' });
  });

  test('0.88.8 - une adresse déjà relancée ou qui nous a écrit ne reçoit rien', async () => {
    const { envois, majs } = simuler({
      aFaire: [
        { id: 'c', email: 'deja@mairie.fr', commune_nom: 'Beaune', mail_status: 'envoye', created_at: MERCREDI },
        { id: 'd', email: 'ecrit@mairie.fr', commune_nom: 'Auxonne', mail_status: 'envoye', created_at: MERCREDI },
      ],
      dejaRelances: [{ email: 'DEJA@mairie.fr' }],
      contacts: [{ email: 'ecrit@mairie.fr' }],
    });

    const bilan = await traiterRelances(VENDREDI_MATIN);

    expect(envois).toHaveLength(0);
    expect(bilan.ecartees).toBe(2);
    expect(majs.map((m) => m.patch.followup_reason)).toEqual(['deja relance', 'nous a deja ecrit']);
  });

  test('0.88.9 - avant l\'échéance, rien ne part et rien n\'est écrit', async () => {
    const { envois, majs } = simuler({
      aFaire: [{ id: 'e', email: 'elu@mairie.fr', commune_nom: 'Chenôve', mail_status: 'envoye', created_at: MERCREDI }],
    });

    const bilan = await traiterRelances(new Date('2026-10-22T07:17:00Z'));

    expect(bilan.en_attente).toBe(1);
    expect(envois).toHaveLength(0);
    expect(majs).toHaveLength(0);
  });
});

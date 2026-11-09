// Fonction Supabase « invite-user », déployée sur le projet de production.
//
// Appelée par la console d'administration (admin/sections/users.js, via
// supabaseService.inviteUser) pour inviter quelqu'un dans un espace, ou lui
// renvoyer son invitation. Cette copie est la source suivie par git : elle se
// déploie sur Supabase avec ses deux fichiers (index.ts et inviter.mjs).
//
// Toute la logique est dans inviter.mjs, testée sans réseau par
// tests/unauth.invitation.spec.js. Ce fichier ne fait que brancher les vrais
// services : Supabase Auth (comptes et liens), la table profiles, Resend
// (l'e-mail). Le lien d'activation est fabriqué par Supabase (generateLink,
// qui n'envoie rien) et envoyé par nous : l'envoi ne dépend donc ni de
// l'ouverture des inscriptions du projet, ni de son serveur d'e-mails.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { inviter, RefusInvitation } from './inviter.mjs';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// Même expéditeur que les autres messages du produit (netlify/functions/lib/mail.mjs).
const EXPEDITEUR = Deno.env.get('INVITATION_FROM') || 'Open Projets <bonjour@openprojets.com>';
// bonjour@openprojets.com n'a pas de boîte : une réponse doit arriver chez quelqu'un.
const REPONDRE_A = (Deno.env.get('INVITATION_REPLY_TO') || '').split(',').map((a) => a.trim()).filter(Boolean);
// Le premier domaine sert de repli pour l'adresse de retour du lien.
const DOMAINES = ['openprojets.com', 'www.openprojets.com', 'grandsprojets.com', 'www.grandsprojets.com'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(URL_SUPABASE, CLE_SERVICE, { auth: { persistSession: false } });

const annuaire = {
  async trouverCompte(email: string) {
    const { data, error } = await admin.rpc('compte_par_email', { p_email: email });
    if (error) throw new Error(`recherche du compte : ${error.message}`);
    const c = Array.isArray(data) ? data[0] : data;
    if (!c) return null;
    return {
      id: c.id,
      confirme: !!c.email_confirmed_at,
      aDejaUtiliseSonCompte: !!c.last_sign_in_at,
      profil: { role: c.role, ville: c.ville },
    };
  },
  async lienInvitation(email: string, retour: string) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: retour } });
    if (error || !data?.user?.id || !data?.properties?.action_link) throw new Error(error?.message || 'lien absent');
    return { id: data.user.id, lien: data.properties.action_link };
  },
  async lienConnexion(email: string, retour: string, compte: { confirme: boolean }) {
    // Adresse jamais confirmée : une nouvelle invitation (Supabase la permet tant que le
    // compte n'est pas confirmé). Adresse confirmée mais jamais utilisée : un lien de connexion.
    const type = compte.confirme ? 'magiclink' : 'invite';
    const { data, error } = await admin.auth.admin.generateLink({ type, email, options: { redirectTo: retour } });
    if (error || !data?.properties?.action_link) throw new Error(error?.message || 'lien absent');
    return { lien: data.properties.action_link };
  },
  async enregistrerProfil(id: string, profil: { role: string; ville: string[] }) {
    // Le profil est normalement créé par le déclencheur on_auth_user_created : upsert au cas où.
    const { error } = await admin.from('profiles').upsert({ id, role: profil.role, ville: profil.ville }, { onConflict: 'id' });
    if (error) throw new Error(`profil : ${error.message}`);
  },
  async supprimerCompte(id: string) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`Compte ${id} non supprimé après un échec d'envoi : ${error.message}`);
  },
  async nomEspace(ville: string) {
    const { data } = await admin.from('city_branding').select('brand_name').eq('ville', ville).maybeSingle();
    return data?.brand_name || null;
  },
};

async function facteur({ a, objet, texte, html }: { a: string; objet: string; texte: string; html: string }) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY absente des secrets de la fonction');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: EXPEDITEUR,
      to: [a],
      subject: objet,
      text: texte,
      html,
      ...(REPONDRE_A.length ? { reply_to: REPONDRE_A } : {}),
    }),
  });
  const corps = await r.text();
  if (!r.ok) throw new Error(`Resend ${r.status} : ${corps.slice(0, 300)}`);
  try { return JSON.parse(corps); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  // Qui appelle : la session de la console, vérifiée par Supabase Auth.
  const jeton = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: session } = await createClient(URL_SUPABASE, CLE_ANON).auth.getUser(jeton);
  if (!session?.user) return json(401, { error: 'Session expirée : reconnectez-vous.' });
  const { data: profil } = await admin.from('profiles').select('role, ville').eq('id', session.user.id).maybeSingle();

  let corps: { email?: string; villes?: string[]; ville?: string; role?: string; redirectUrl?: string };
  try { corps = await req.json(); } catch { return json(400, { error: 'Requête illisible.' }); }

  try {
    const resultat = await inviter(
      {
        appelant: profil ? { id: session.user.id, role: profil.role, villes: profil.ville } : null,
        email: corps.email,
        ville: corps.ville || corps.villes?.[0],
        role: corps.role || 'invited',
        origine: corps.redirectUrl || req.headers.get('Origin') || '',
      },
      { annuaire, facteur, domaines: DOMAINES },
    );
    console.log(`Invitation ${resultat.statut} : ${resultat.email}${resultat.envoi?.id ? ` (Resend ${resultat.envoi.id})` : ''}`);
    return json(200, resultat);
  } catch (e) {
    if (e instanceof RefusInvitation) {
      console.error(`Invitation refusée (${e.statut}) : ${e.message}${e.detail ? ` - ${e.detail}` : ''}`);
      return json(e.statut, { error: e.message, ...(e.detail ? { detail: e.detail } : {}) });
    }
    console.error('Invitation : erreur inattendue', e);
    return json(500, { error: "L'invitation a échoué sur une erreur inattendue. Rien n'a été envoyé." });
  }
});

// Fonction Supabase « clever-endpoint », déployée sur le projet de production.
//
// Elle est appelée par le formulaire de demande de démo du site
// (home-src/src/components/DemoRequestForm.vue) juste après l'insertion dans
// contact_requests, et envoie la demande à l'équipe commerciale par Resend.
// Cette copie est la source suivie par git : toute modification se déploie
// ensuite sur Supabase (tableau de bord ou outil de déploiement), ce fichier
// n'est pas relu au moment de l'exécution.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Les destinataires de chaque demande de démo, à modifier ici et nulle part ailleurs.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const DESTINATAIRES = ['solal@vazy.app', 'loic@vazy.app', 'arnaud@vazy.app'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const contact = await req.json();
    const text = `
Nouvelle demande de démo

CONTACT
-------
Nom : ${contact.full_name}
Email : ${contact.email}
${contact.phone ? `Téléphone : ${contact.phone}` : ''}

ORGANISATION
------------
Nom : ${contact.organization}

MESSAGE
-------
${contact.message}

${contact.referrer ? `\nRéférent : ${contact.referrer}` : ''}
    `.trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: DESTINATAIRES,
        reply_to: contact.email || undefined,
        subject: `Nouvelle demande de démo : ${contact.organization}`,
        text: text
      })
    });
    const data = await res.json();
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

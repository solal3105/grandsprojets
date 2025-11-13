/**
 * Netlify Function: send-contact-email
 * 
 * ⚠️ DEPRECATED - Utiliser le système Supabase à la place
 * 
 * La landing page utilise maintenant le même système que l'app principale:
 * - Formulaire: modules/contact-form.js
 * - Stockage: Table Supabase "contact_requests"
 * - Email: Supabase Edge Function "clever-endpoint"
 * 
 * Cette fonction n'est plus utilisée.
 */

export async function handler(event) {
  return {
    statusCode: 410,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Cette fonction est dépréciée. Utiliser le système Supabase à la place.',
    }),
  };
}

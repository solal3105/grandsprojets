// Les espaces essai sont des cartes recensées par Open Projets à partir de
// sources publiques. Leur indexation dépend toujours de city_branding.
export const isGeneratedSpace = (ville) => /^essai-/i.test(String(ville || ''));

/** Date éditoriale fiable, avec repli historique sur la création. */
export function projectModifiedAt(project) {
  const dates = [project.content_updated_at, project.created_at]
    .filter(Boolean).map((date) => new Date(date).getTime()).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
}

/**
 * Déploiement progressif : avant la migration, seul le nouveau champ manque.
 * On ne masque aucune autre erreur SQL, réseau ou d'autorisation.
 */
export async function fetchProjectResponse(url, options) {
  const response = await fetch(url, options);
  if (response.status !== 400) return response;
  const error = await response.clone().json().catch(() => null);
  if (error?.code !== '42703' || !error.message?.includes('content_updated_at')) return response;
  const fallback = new URL(url);
  const columns = (fallback.searchParams.get('select') || '').split(',');
  if (!columns.includes('content_updated_at')) return response;
  fallback.searchParams.set('select', columns.filter((column) => column !== 'content_updated_at').join(','));
  return fetch(fallback, options);
}

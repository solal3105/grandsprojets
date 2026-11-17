/**
 * Le temps d'une invocation de la démo, et le travail qu'on y fait tenir.
 *
 * Une fonction Netlify est tuée au bout de 60 s, sans erreur ni `finally` : ce
 * qui n'a pas été enregistré avant est perdu. Le 13/11/2026, la rédaction de
 * Villeurbanne a buté neuf fois de suite sur ce mur. Un article à huit sources
 * prenait à lui seul une minute, il n'était enregistré qu'à la fin de sa
 * tranche, et chaque reprise recommençait les mêmes articles pour se faire
 * couper au même endroit.
 *
 * Ce module ne fait AUCUN appel réseau. Il dit quand une invocation doit avoir
 * fini, quelle étape on peut encore y lancer, et comment enregistrer au fil de
 * l'eau sans que deux écritures se croisent.
 */

/* Le mur de la plateforme, mesuré le 13/11/2026 : chaque invocation coupée
   durait entre 60,1 et 60,5 s. */
export const LIMITE_INVOCATION_MS = 60000;
/* Ce qu'il faut garder après la dernière étape : l'enregistrement final du
   brouillon (plusieurs centaines de kilo-octets) et l'annonce de la suite. */
export const MARGE_DE_FIN_MS = 5000;

/** Heure à laquelle le travail d'une invocation commencée à `debut` doit être fini. */
export function echeanceDeLInvocation(debut) {
  return debut + LIMITE_INVOCATION_MS - MARGE_DE_FIN_MS;
}

/**
 * La prochaine étape de rédaction qu'on peut lancer, ou null.
 *
 * Un article se fait en quatre étapes, enregistrées chacune dès qu'elle est
 * finie : lire ses sources, en extraire les faits (un appel par lot de
 * sources, les lots d'un même projet partent ensemble), vérifier à quel projet
 * se rapporte chaque fait, écrire. Une étape ne part que si sa durée maximale
 * tient dans le temps qui reste : elle n'est donc jamais coupée par le mur.
 * Les projets sont pris dans l'ordre, pour que les articles arrivent un à un.
 *
 * @param {{projets: Object<string, {etape: string, sorties?: Array}>, finis: number[]}} redac
 * @param {number} nbProjets
 * @param {Set<string>} enCours - clés des étapes lancées et pas encore finies
 * @param {number} resteMs - temps restant avant l'échéance
 * @param {Object<string, number>} durees - durée maximale de chaque sorte d'étape
 * @param {number} [ouvertsMax] - projets entamés à la fois au plus : chacun garde
 *   ses sources dans le brouillon jusqu'à son article, et finir les projets
 *   entamés fait arriver les articles plus tôt que d'en ouvrir d'autres
 * @returns {{i: number, type: string, k?: number, cle: string} | null}
 */
export function prochaineEtape(redac, nbProjets, enCours, resteMs, durees, ouvertsMax = Infinity) {
  const finis = new Set(redac.finis);
  const ouverts = new Set([
    ...Object.keys(redac.projets).map(Number),
    ...[...enCours].map((cle) => Number(cle.split(':')[0])),
  ]);
  for (let i = 0; i < nbProjets; i++) {
    if (finis.has(i)) continue;
    const p = redac.projets[i];
    if (!p && !ouverts.has(i) && ouverts.size >= ouvertsMax) continue;
    const etape = p?.etape || 'sources';
    if (etape === 'extraction') {
      if (durees.extraction > resteMs) continue;
      const k = p.sorties.findIndex((s, n) => s === null && !enCours.has(`${i}:lot:${n}`));
      if (k >= 0) return { i, type: 'extraction', k, cle: `${i}:lot:${k}` };
      continue;
    }
    const cle = `${i}:${etape}`;
    if (enCours.has(cle) || durees[etape] > resteMs) continue;
    return { i, type: etape, cle };
  }
  return null;
}

/**
 * Écritures du brouillon, une à la fois et regroupées.
 * Plusieurs étapes finissent en même temps : chacune demande un
 * enregistrement, mais une écriture déjà en attente emportera l'état le plus
 * récent, il est inutile d'en ajouter une autre derrière.
 * @param {() => Promise<void>} ecrire - écrit l'état COURANT au moment où elle part
 */
export function ecrituresEnSerie(ecrire) {
  let file = Promise.resolve();
  let enAttente = false;
  return {
    demander() {
      if (enAttente) return file;
      enAttente = true;
      file = file.then(async () => {
        enAttente = false;
        try {
          await ecrire();
        } catch (e) {
          // Une écriture manquée sera rattrapée par la suivante
          console.warn(`[demo-generate] enregistrement intermédiaire impossible :: ${e?.message}`);
        }
      });
      return file;
    },
    vider() {
      return file;
    },
  };
}

/**
 * Âge d'un brouillon en minutes, compté depuis la dernière fois qu'une
 * invocation l'a écrit, et non depuis sa création. Une métropole se génère en
 * plus d'un quart d'heure : comptée depuis la création, une génération qui
 * avançait passait pour abandonnée et repartait de zéro.
 * @param {{created_at?: string, payload?: {_vuLe?: number}} | null} instance
 * @param {number} [maintenant]
 */
export function ageDuBrouillonMin(instance, maintenant = Date.now()) {
  if (!instance) return Infinity;
  const cree = new Date(instance.created_at).getTime();
  const vu = Number(instance.payload?._vuLe) || 0;
  const reference = Math.max(Number.isFinite(cree) ? cree : 0, vu);
  return reference ? (maintenant - reference) / 60000 : Infinity;
}

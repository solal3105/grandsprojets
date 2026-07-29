/* ============================================================================
   SCÈNE - carte-postale/scene.js  (window.Scene)

   La carte vit À L'INTÉRIEUR de la carte postale. Elle porte un fond IGN d'une
   époque donnée, vu en oblique : c'est l'inclinaison qui fait qu'un dessin de
   Cassini ou une photographie de 1957 cessent d'être des images plates pour
   devenir un point de vue.

   Le passage d'une époque à l'autre se fait en FONDU, jamais en coupure : deux
   couches coexistent le temps de la transition. C'est le moment fort de
   l'outil, celui où l'on voit une commune se transformer sous ses yeux.
   ============================================================================ */
(() => {
  'use strict';

  /* PAS DE RELIEF ICI, et c'est une décision, pas un oubli.

     /demo/ drape ses couches sur un modèle de terrain servi par AWS. Mesuré :
     ces tuiles ne renvoient AUCUN en-tête CORS. Dès qu'elles alimentent la
     scène, le navigateur « teinte » le canvas et refuse toute relecture : la
     capture d'impression revient vide, sans erreur visible. C'est exactement ce
     qui s'est produit à la première mise au point de cet outil.

     Trois issues possibles : renoncer au relief, relayer les tuiles par une
     fonction serveur pour leur ajouter l'en-tête manquant, ou payer un
     fournisseur de terrain. On renonce, pour deux raisons : l'outil doit rester
     dans un seul dossier, sans route serveur ; et surtout l'aperçu à l'écran
     doit être EXACTEMENT ce qui sort de l'imprimante. Une carte postale dont
     le relief disparaît à l'impression serait pire que pas de relief du tout.

     L'inclinaison suffit à donner la profondeur : une orthophotographie est de
     toute façon redressée, la draper sur des collines relève de l'effet, pas de
     la vérité du document. */

  let map = null;
  let pret = false;
  let compteur = 0;
  let coucheActive = null;
  let sourceActive = null;
  // Tuiles refusées par l'IGN pour la source en cours : c'est ainsi qu'on sait
  // qu'une époque ne couvre pas cet endroit, plutôt que d'afficher un vide.
  const manquantes = new Map();

  const prefereCalme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function supportWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  const Scene = {
    ok: false,

    init(idConteneur) {
      if (!window.maplibregl || !supportWebGL()) return false;
      try {
        map = new maplibregl.Map({
          container: idConteneur,
          // Style vide : le fond est entièrement fourni par l'époque choisie
          style: { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#0d1420' } }] },
          center: [2.6, 46.5],
          zoom: 4.6,
          pitch: 0,
          bearing: 0,
          attributionControl: false,
          // Indispensable : sans lui, le canvas ne peut pas être relu pour
          // fabriquer l'image d'impression.
          preserveDrawingBuffer: true,
          fadeDuration: 220,
        });

        map.on('error', (e) => {
          // Une tuile absente est un 404 : on le compte pour la source visée
          const src = e?.sourceId;
          if (!src) return;
          manquantes.set(src, (manquantes.get(src) || 0) + 1);
        });

        map.on('load', () => {
          pret = true;
          Scene.ok = true;
        });

        // Le conteneur naît à une taille, la carte postale peut changer de
        // taille ensuite : sans cela le canvas reste à ses dimensions initiales.
        if (typeof ResizeObserver !== 'undefined') {
          new ResizeObserver(() => { try { map.resize(); } catch { /* détruite */ } })
            .observe(document.getElementById(idConteneur));
        }
        Scene.ok = true;
        return true;
      } catch {
        return false;
      }
    },

    quandPrete(fn) {
      if (pret) fn();
      else map?.once('load', fn);
    },

    /* Pose une époque en fondu par-dessus la précédente.
       Rend une promesse qui dit si l'IGN a réellement servi des tuiles ici. */
    async poser(epoque) {
      if (!map) return { couvert: false };
      const id = `ign-${compteur++}`;
      const ancienneCouche = coucheActive;
      const ancienneSource = sourceActive;

      map.addSource(id, {
        type: 'raster',
        tiles: epoque.tiles,
        tileSize: 256,
        maxzoom: epoque.zoomMax,
        attribution: 'IGN',
      });
      map.addLayer({
        id,
        type: 'raster',
        source: id,
        paint: {
          'raster-opacity': 0,
          'raster-opacity-transition': { duration: prefereCalme ? 0 : 900 },
          // Les dessins anciens gagnent en présence avec un léger contraste ;
          // les photographies, elles, restent fidèles.
          'raster-contrast': epoque.nature === 'dessin' ? 0.06 : 0,
          'raster-saturation': epoque.nature === 'dessin' ? -0.08 : 0,
        },
      });
      coucheActive = id;
      sourceActive = id;
      manquantes.set(id, 0);

      // La trame monte ; l'ancienne descend puis disparaît
      requestAnimationFrame(() => {
        try { map.setPaintProperty(id, 'raster-opacity', 1); } catch { /* retirée */ }
      });
      if (ancienneCouche) {
        setTimeout(() => {
          try { if (map.getLayer(ancienneCouche)) map.removeLayer(ancienneCouche); } catch { /* déjà retirée */ }
          try { if (map.getSource(ancienneSource)) map.removeSource(ancienneSource); } catch { /* déjà retirée */ }
          manquantes.delete(ancienneSource);
        }, prefereCalme ? 0 : 1000);
      }

      // On laisse à l'IGN le temps de répondre avant de juger de la couverture
      await Scene.reposee(2600);
      return { couvert: (manquantes.get(id) || 0) < 4 };
    },

    // Attend que la carte ait fini de charger, avec une borne : sur un réseau
    // de salon, `idle` peut ne jamais venir.
    reposee(borneMs = 8000) {
      return new Promise((resoudre) => {
        if (!map) return resoudre(false);
        let fini = false;
        const stop = () => { if (!fini) { fini = true; map.off('idle', stop); resoudre(true); } };
        map.on('idle', stop);
        setTimeout(() => { if (!fini) { fini = true; map.off('idle', stop); resoudre(false); } }, borneMs);
      });
    },

    plongerSur({ lat, lng, population }) {
      if (!map) return;
      const zoom = population > 100000 ? 13.4 : population > 20000 ? 14.2 : population > 5000 ? 14.8 : 15.4;
      map.flyTo({
        center: [lng, lat], zoom, pitch: 52, bearing: -18,
        duration: prefereCalme ? 0 : 4200, curve: 1.5, essential: true,
      });
    },

    angle(pitch, bearing) {
      if (!map) return;
      map.easeTo({ pitch, bearing, duration: prefereCalme ? 0 : 900, essential: true });
    },

    /* Image de la carte à la définition d'impression.
       On ne peut pas agrandir après coup une capture d'écran sans la rendre
       floue : le conteneur est donc porté à la taille cible le temps du rendu,
       hors champ, puis remis comme il était. */
    async capturer(largeur, hauteur) {
      if (!map) return null;
      const el = map.getContainer();
      const avant = { width: el.style.width, height: el.style.height, position: el.style.position };
      el.style.width = `${largeur}px`;
      el.style.height = `${hauteur}px`;
      map.resize();
      await Scene.reposee(9000);

      /* La lecture se fait PENDANT le rendu, pas après.
         `preserveDrawingBuffer` ne suffit pas : une fois la trame composée par
         le navigateur, le tampon peut être vidé, et `toDataURL` rend alors une
         image parfaitement vide, sans la moindre erreur. Mesuré ici même : le
         PNG faisait 48 Ko et tous ses pixels étaient noirs. On demande donc un
         nouveau dessin et on lit dans la foulée, depuis l'événement `render`. */
      const donnees = await new Promise((resoudre) => {
        let rendu = false;
        map.once('render', () => {
          rendu = true;
          try {
            resoudre(map.getCanvas().toDataURL('image/png'));
          } catch (e) {
            // L'autre cause possible : une source sans en-tête CORS a « teinté »
            // le canvas, et le navigateur en interdit toute relecture.
            console.error('[carte-postale] relecture refusée (source sans CORS ?) ::', e?.message);
            resoudre(null);
          }
        });
        map.triggerRepaint();
        setTimeout(() => { if (!rendu) resoudre(null); }, 6000);
      });
      el.style.width = avant.width;
      el.style.height = avant.height;
      el.style.position = avant.position;
      map.resize();
      return donnees;
    },

    centre() {
      const c = map?.getCenter();
      return c ? { lat: c.lat, lng: c.lng } : null;
    },
  };

  window.Scene = Scene;
})();

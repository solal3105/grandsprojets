/* ============================================================================
   CARTE POSTALE - carte-postale/app.js

   Outil de salon : on choisit une commune, on remonte le temps sur un fond
   IGN, on cadre, on inscrit une légende, on imprime.

   Parti pris d'interface : la carte postale n'est pas un aperçu posé à côté
   d'un éditeur, elle EST l'éditeur. Elle flotte au centre en perspective, et
   c'est en la survolant qu'elle se met à plat pour se laisser cadrer.
   ============================================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // À renseigner quand le numéro du stand sera arrêté. Vide, la ligne
  // n'apparaît ni à l'écran ni à l'impression : mieux vaut pas de numéro qu'un
  // numéro faux sur un objet qu'on laisse entre les mains d'un élu.
  const TELEPHONE = '';
  const CIBLE_QR = 'https://openprojets.com/demo/';
  const ANNEE = new Date().getFullYear();

  const carte = $('carte-postale');
  const champCommune = $('commune');
  const listeSug = $('suggestions');

  let commune = null;
  let epoque = null;
  let suggestions = [];
  let choisi = -1;
  let minuteurSaisie = null;
  let sequence = 0;

  const aScene = window.Scene?.init('map');

  /* ─── L'objet : inclinaison et reflet ───────────────────────────────────
     Deux états. Au repos, la carte suit le pointeur : elle a du volume, elle
     accroche la lumière. Dès qu'on la survole pour travailler, elle se met à
     plat, et ce n'est pas qu'une coquetterie : une carte inclinée fausse les
     coordonnées que MapLibre lit du pointeur, et le cadrage dériverait. */

  let cible = { x: 0, y: 0 };
  let courant = { x: 0, y: 0 };
  let anim = null;

  function boucle() {
    anim = requestAnimationFrame(boucle);
    courant.x += (cible.x - courant.x) * 0.08;
    courant.y += (cible.y - courant.y) * 0.08;
    const objet = carte.querySelector('.cp__objet');
    if (!objet) return;
    objet.style.setProperty('--ry', `${courant.x * 14}deg`);
    objet.style.setProperty('--rx', `${-courant.y * 10 + 4}deg`);
    const reflet = carte.querySelector('.cp__reflet');
    if (reflet) {
      reflet.style.setProperty('--reflet-angle', `${100 + courant.x * 55}deg`);
      reflet.style.setProperty('--reflet-force', String(0.45 + Math.abs(courant.x) * 0.5));
    }
    const halo = document.querySelector('.scene__halo');
    if (halo) halo.style.transform = `translate(calc(-50% + ${courant.x * 40}px), calc(-50% + ${courant.y * 26}px))`;
  }

  window.addEventListener('pointermove', (e) => {
    cible = {
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: (e.clientY / window.innerHeight) * 2 - 1,
    };
  });

  // Survol de la carte : elle s'aplatit pour se laisser manipuler
  carte.addEventListener('pointerenter', () => {
    if (carte.dataset.etat === 'carte') carte.classList.add('is-plat');
  });
  carte.addEventListener('pointerleave', () => carte.classList.remove('is-plat'));

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) boucle();
  window.addEventListener('pagehide', () => cancelAnimationFrame(anim));

  /* ─── Choix de la commune ─── */

  async function chercher(q) {
    if (q.length < 2) return rendreSuggestions([]);
    const n = ++sequence;
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=departement,population,centre&boost=population&limit=6`);
      const l = r.ok ? await r.json() : [];
      if (n === sequence) rendreSuggestions(l);
    } catch {
      if (n === sequence) rendreSuggestions([]);
    }
  }

  const echapper = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function rendreSuggestions(liste) {
    suggestions = liste;
    choisi = -1;
    if (!liste.length) { listeSug.hidden = true; listeSug.innerHTML = ''; return; }
    listeSug.innerHTML = liste.map((c, i) => `
      <li data-i="${i}">
        <span class="n">${echapper(c.nom)}</span>
        <span class="m">${echapper(c.departement?.nom || '')} · ${(c.population || 0).toLocaleString('fr-FR')} hab.</span>
      </li>`).join('');
    listeSug.hidden = false;
  }

  champCommune.addEventListener('input', () => {
    clearTimeout(minuteurSaisie);
    minuteurSaisie = setTimeout(() => chercher(champCommune.value.trim()), 170);
  });

  champCommune.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!suggestions.length) return;
      choisi = (choisi + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      [...listeSug.children].forEach((li, i) => li.classList.toggle('is-choisi', i === choisi));
    } else if (e.key === 'Enter') {
      const c = suggestions[choisi >= 0 ? choisi : 0];
      if (c) demarrer(c);
    } else if (e.key === 'Escape') {
      rendreSuggestions([]);
    }
  });

  listeSug.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) demarrer(suggestions[parseInt(li.dataset.i, 10)]);
  });

  /* ─── Entrée dans l'atelier ─── */

  function demarrer(c) {
    commune = c;
    rendreSuggestions([]);
    champCommune.blur();
    carte.dataset.etat = 'carte';
    $('entete-commune').textContent = c.nom;
    $('etape-commune').classList.remove('is-actif');
    $('etape-atelier').classList.add('is-actif');
    $('cp-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(CIBLE_QR)}`;
    if (TELEPHONE) { $('cp-tel').textContent = TELEPHONE; $('cp-tel').hidden = false; }

    if (aScene) {
      window.Scene.quandPrete(() => {
        window.Scene.plongerSur({
          lat: c.centre.coordinates[1],
          lng: c.centre.coordinates[0],
          population: c.population || 0,
        });
      });
    }
    construireFrise();
    // Par défaut, la vue aérienne des années 1950 : c'est celle qui provoque la
    // réaction, un centre-bourg entouré de champs là où il y a des lotissements.
    choisirEpoque(window.Epoques.liste.find((e) => e.id === 'photo-1950') || window.Epoques.liste[0]);
    majInscription(`${c.nom}`);
    $('inscription').value = c.nom;
  }

  /* ─── La frise des époques ─── */

  function construireFrise() {
    const frise = $('frise');
    frise.innerHTML = '';
    for (const e of window.Epoques.liste) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'epoque';
      b.dataset.id = e.id;
      b.innerHTML = `<span class="epoque__an">${echapper(e.annee ? String(e.annee) : "Aujourd'hui")}</span>`
        + `<span class="epoque__quoi">${echapper(e.periode)}</span>`;
      b.addEventListener('click', () => choisirEpoque(e));
      frise.appendChild(b);
    }
  }

  /* Le halo de la scène prend la teinte de l'époque : sépia pour les documents
     anciens, bleu pour les vues récentes. Rien de fonctionnel, mais l'écran
     respire avec l'objet au lieu de rester figé. */
  function majHalo(e) {
    const teinte = !e ? '255,77,106'
      : e.nature === 'dessin' ? '196,148,88'
        : e.annee && e.annee < 1990 ? '188,170,150'
          : '96,150,255';
    document.querySelector('.scene__halo')?.style.setProperty('--halo', `rgba(${teinte},0.24)`);
  }

  async function choisirEpoque(e) {
    epoque = e;
    [...$('frise').children].forEach((b) => b.classList.toggle('is-actif', b.dataset.id === e.id));
    $('frise-etat').hidden = true;
    majHalo(e);
    majPunchline();
    majLegendes();
    if (!aScene) return;
    const { couvert } = await window.Scene.poser(e);
    // Dire quand l'IGN n'a rien à cet endroit vaut mieux qu'un carré vide : la
    // couverture ancienne est inégale selon les communes.
    if (!couvert && epoque?.id === e.id) {
      $('frise-etat').textContent = "L'IGN n'a pas d'image de cette époque à cet endroit. Choisissez une autre année.";
      $('frise-etat').hidden = false;
      [...$('frise').children].forEach((b) => {
        if (b.dataset.id === e.id) b.classList.add('is-vide');
      });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!epoque || document.activeElement?.tagName === 'INPUT') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const l = window.Epoques.liste;
    const i = l.findIndex((x) => x.id === epoque.id);
    const suivant = l[(i + (e.key === 'ArrowRight' ? 1 : -1) + l.length) % l.length];
    choisirEpoque(suivant);
  });

  /* ─── Textes de la carte ─── */

  function majPunchline() {
    const t = window.Epoques.punchline(epoque, ANNEE);
    $('cp-punchline').innerHTML = echapper(t).replace('\n', '<br />');
  }

  function majInscription(t) {
    $('cp-inscription').textContent = t || '';
  }

  function majLegendes() {
    const boite = $('legendes');
    boite.innerHTML = '';
    for (const l of window.Epoques.legendes(commune?.nom, epoque).slice(0, 4)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'puce';
      b.textContent = l;
      b.addEventListener('click', () => { $('inscription').value = l; majInscription(l); });
      boite.appendChild(b);
    }
  }

  $('inscription').addEventListener('input', (e) => majInscription(e.target.value));

  /* ─── Angle de prise de vue ─── */

  for (const b of document.querySelectorAll('.segment')) {
    b.addEventListener('click', () => {
      document.querySelectorAll('.segment').forEach((x) => x.classList.toggle('is-actif', x === b));
      window.Scene?.angle(Number(b.dataset.pitch), Number(b.dataset.bearing));
    });
  }

  /* ─── Sortie ─── */

  async function fabriquer(bouton) {
    const avant = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Préparation...';
    // Pendant la capture, la carte est portée à la taille d'impression : on la
    // met à plat pour que rien ne bouge sous le rendu.
    carte.classList.add('is-plat');
    try {
      const image = aScene
        ? await window.Scene.capturer(window.Postcard.imageLargeur, window.Postcard.imageHauteur)
        : null;
      // Une carte postale sans son image n'est pas une carte postale : mieux
      // vaut le dire que d'imprimer un rectangle vide devant un prospect.
      if (aScene && !image) {
        alert("L'image de la carte n'a pas pu être récupérée. Rechargez la page et réessayez.");
        return null;
      }
      return await window.Postcard.composer({
        imageCarte: image,
        inscription: $('inscription').value.trim(),
        punchline: window.Epoques.punchline(epoque, ANNEE),
        telephone: TELEPHONE,
        cibleQr: CIBLE_QR,
      });
    } finally {
      bouton.disabled = false;
      bouton.textContent = avant;
      carte.classList.remove('is-plat');
    }
  }

  const nomFichier = () => `carte-postale-${(commune?.nom || 'commune').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-${epoque?.annee || 'aujourdhui'}`;

  $('btn-imprimer').addEventListener('click', async (e) => {
    const c = await fabriquer(e.currentTarget);
    if (c) window.Postcard.imprimer(c);
  });

  $('btn-png').addEventListener('click', async (e) => {
    const c = await fabriquer(e.currentTarget);
    if (c) window.Postcard.telecharger(c, nomFichier());
  });

  $('btn-autre').addEventListener('click', () => {
    commune = null;
    epoque = null;
    carte.dataset.etat = 'attente';
    $('etape-atelier').classList.remove('is-actif');
    $('etape-commune').classList.add('is-actif');
    champCommune.value = '';
    $('entete-commune').textContent = '';
    majHalo(null);
    majInscription('');
    champCommune.focus();
  });
})();

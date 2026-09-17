/* ============================================================================
   CARTE POSTALE - carte-postale/app.js

   Outil de salon : on choisit une commune, on remonte le temps sur un fond
   IGN, on cadre, on inscrit une légende, on imprime.

   Parti pris d'interface : la carte postale n'est pas un aperçu posé à côté
   d'un éditeur, elle EST l'éditeur. Elle flotte au centre en perspective, et
   elle se met à plat dès qu'on commence à cadrer ou à zoomer.
   ============================================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const ANNEE = new Date().getFullYear();

  const { email, phone, url, qrImage } = window.Postcard.contact;
  $('cp-email').textContent = email;
  $('cp-email').href = `mailto:${email}`;
  $('cp-phone').textContent = phone;
  $('cp-phone').href = `tel:${phone.replace(/\s/g, '')}`;
  $('cp-qr-link').href = url;
  $('cp-qr-img').src = qrImage;

  const carte = $('carte-postale');

  let commune = null;
  let epoque = null;
  // Une saisie manuelle suspend le suivi ; choisir une suggestion le réactive.
  let captionTemplate = 'period';

  const aScene = window.Scene?.init('map');
  const addressSearch = window.AddressSearch.init({ onSelect: selectLocation });

  /* Le pointeur agit autour du centre de la carte, dans son cadre non tourné.
     Un seul lissage, indépendant de la fréquence d'écran, puis la boucle
     s'arrête. Les réglages du pupitre ne font jamais bouger l'objet. */
  const cardObject = carte.querySelector('.cp__objet');
  const reflection = carte.querySelector('.cp__reflet');
  const motionPreference = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let target = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let frameId = 0;
  let lastFrame = 0;
  let motionLocked = false;

  function paintTilt() {
    cardObject.style.setProperty('--ry', `${current.x * 5}deg`);
    cardObject.style.setProperty('--rx', `${-current.y * 4}deg`);
    reflection.style.setProperty('--reflet-angle', `${115 + current.x * 20}deg`);
    reflection.style.setProperty('--reflet-force', String(0.3 + Math.hypot(current.x, current.y) * 0.12));
    carte.classList.toggle('is-tilting', !!(current.x || current.y || target.x || target.y));
  }

  function animateTilt(time) {
    const delta = Math.min(time - (lastFrame || time - 16), 50);
    const blend = 1 - Math.exp(-delta / 65);
    lastFrame = time;
    current.x += (target.x - current.x) * blend;
    current.y += (target.y - current.y) * blend;
    const settled = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) < 0.002;
    if (settled) current = { ...target };
    paintTilt();
    frameId = settled ? 0 : requestAnimationFrame(animateTilt);
    if (settled) lastFrame = 0;
  }

  function setTilt(x, y) {
    target = { x, y };
    if (!frameId) frameId = requestAnimationFrame(animateTilt);
  }

  function resetTilt() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
    target = { x: 0, y: 0 };
    current = { x: 0, y: 0 };
    paintTilt();
  }

  carte.addEventListener('pointermove', (event) => {
    if (!motionPreference.matches || event.pointerType !== 'mouse' || event.buttons
      || motionLocked || carte.classList.contains('is-plat') || carte.matches(':focus-within')) return;
    const rect = carte.getBoundingClientRect();
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    setTilt(
      clamp((event.clientX - rect.left - rect.width / 2) / (rect.width / 2)),
      clamp((event.clientY - rect.top - rect.height / 2) / (rect.height / 2)),
    );
  });
  carte.addEventListener('pointerleave', () => {
    motionLocked = false;
    if (motionPreference.matches) setTilt(0, 0);
    else resetTilt();
  });

  // Avant que MapLibre lise le geste, le plan redevient plat sans transition.
  // Il le reste jusqu'à la sortie du pointeur, même après le relâchement.
  function lockTilt() {
    motionLocked = true;
    resetTilt();
  }
  $('map').addEventListener('pointerdown', lockTilt, { capture: true });
  $('map').addEventListener('wheel', lockTilt, { capture: true, passive: true });
  carte.addEventListener('focusin', lockTilt);
  carte.addEventListener('pointercancel', lockTilt);
  motionPreference.addEventListener('change', () => { if (!motionPreference.matches) resetTilt(); });
  window.addEventListener('resize', resetTilt);
  window.addEventListener('blur', resetTilt);
  window.addEventListener('pagehide', resetTilt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetTilt(); });
  resetTilt();

  const echapper = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* Un seul choix ouvre la carte et retrouve la commune du lieu. */
  function selectLocation(location) {
    const initial = !epoque;
    commune = location.commune;
    const selectedCity = commune;
    carte.dataset.etat = 'carte';
    resetTilt();
    document.body.classList.add('a-commune');
    $('entete-commune').textContent = commune.nom;
    $('search-intro').hidden = true;
    $('etape-atelier').classList.add('is-actif');

    if (initial) {
      construireFrise();
      choisirEpoque(window.Epoques.liste.find((e) => e.id === 'photo-1950') || window.Epoques.liste[0]);
    } else {
      majLegendes();
    }
    if (aScene) {
      window.Scene.quandPrete(() => {
        if (commune !== selectedCity) return;
        window.Scene.focusLocation({ ...location, population: selectedCity.population, initial });
      });
    }
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

  function updateAutomaticCaption() {
    if (captionTemplate === null) return;
    const text = window.Epoques.caption(commune?.nom, epoque, captionTemplate);
    $('inscription').value = text;
    majInscription(text);
  }

  function majLegendes() {
    const boite = $('legendes');
    boite.innerHTML = '';
    for (const l of window.Epoques.legendes(commune?.nom, epoque).slice(0, 4)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'puce';
      b.textContent = l.text;
      b.addEventListener('click', () => { captionTemplate = l.id; updateAutomaticCaption(); });
      boite.appendChild(b);
    }
    updateAutomaticCaption();
  }

  $('inscription').addEventListener('input', (e) => {
    captionTemplate = null;
    majInscription(e.target.value);
  });

  /* ─── Angle de prise de vue ─── */

  for (const b of document.querySelectorAll('.segment')) {
    b.addEventListener('click', () => {
      document.querySelectorAll('.segment').forEach((x) => x.classList.toggle('is-actif', x === b));
      window.Scene?.angle(Number(b.dataset.pitch), Number(b.dataset.bearing));
    });
  }

  /* ─── Sortie ─── */

  async function fabriquer(bouton) {
    if (carte.classList.contains('is-plat')) return null;
    const avant = bouton.textContent;
    $('btn-imprimer').disabled = true;
    $('btn-png').disabled = true;
    bouton.textContent = 'Préparation...';
    // La carte reste immobile pendant le rendu à la définition d'impression.
    carte.classList.add('is-plat');
    resetTilt();
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
      });
    } catch (error) {
      console.error('La préparation de la carte postale a échoué.', error);
      alert("La carte postale n'a pas pu être préparée. Rechargez la page et réessayez.");
      return null;
    } finally {
      $('btn-imprimer').disabled = false;
      $('btn-png').disabled = false;
      bouton.textContent = avant;
      carte.classList.remove('is-plat');
    }
  }

  const nomFichier = () => `carte-postale-${(commune?.nom || 'commune').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-${epoque?.annee || 'aujourdhui'}`;

  $('btn-imprimer').addEventListener('click', async (e) => {
    const c = await fabriquer(e.currentTarget);
    if (c) {
      try {
        await window.Postcard.imprimer(c);
      } catch (error) {
        console.error("L'impression de la carte postale a échoué.", error);
        alert("L'impression n'a pas pu démarrer. Réessayez ou téléchargez l'image.");
      }
    }
  });

  $('btn-png').addEventListener('click', async (e) => {
    const c = await fabriquer(e.currentTarget);
    if (c) window.Postcard.telecharger(c, nomFichier());
  });

  $('btn-autre').addEventListener('click', () => addressSearch.focus());

})();

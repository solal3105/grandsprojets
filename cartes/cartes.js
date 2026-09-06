/* ============================================================================
   LES CARTES DES COMMUNES - /cartes/cartes.js

   Sur le site (par défaut) : la page est déjà rendue par l'edge function, ce
   script pose la France vue du ciel, anime la recherche et, si le pré-rendu a
   manqué, reconstruit le catalogue depuis la base.

   Sur le stand (?kiosk=1) : une seule règle, on ne sort jamais de la page.
   Les scènes se relaient toutes seules (l'accueil, trois communes vues du
   ciel, comment ça marche, la Métropole de Lyon...) ; tout ce qu'un visiteur
   ouvre se pose en COUCHE par-dessus l'accueil (une carte, la saisie, le
   panneau pour emporter la carte), et un compteur de veille referme chaque
   couche sans geste. La génération d'une nouvelle carte est confiée à
   l'écran /demo/, avec une adresse de retour : il revient ici de lui-même.

   Tablette modeste : un seul minuteur de veille (une fois par seconde), une
   seule chaîne de minuteurs pour les scènes, une seule image aérienne par
   vue (préchargée pour la scène suivante), la carte fermée détruite (src
   vidé) pour rendre sa mémoire.
   ============================================================================ */
import {
  chargerCatalogue, villeVedette, renderCommune, renderPoint, renderVille, renderCompte,
  nomDepuisSlug, dureeEstimee, urlFrance, urlAerienne, positionDansVue, viewBoxDe, VUES_FRANCE,
  BASE_ORIGIN, PREFIXE_ESSAI, VILLE_LYON,
} from './catalogue.js';

const $ = (id) => document.getElementById(id);
const PARAMS = new URLSearchParams(window.location.search);
const KIOSK = PARAMS.get('kiosk') === '1';
// Clé de stand : l'écran de génération lève son quota par adresse IP avec elle
const CLE = (PARAMS.get('k') || '').slice(0, 80);
const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const OUVRABLE_RE = new RegExp(`^(${PREFIXE_ESSAI}[a-z0-9-]+|${VILLE_LYON})$`);
const EMAIL_RE = /^[^\s@]+@[^\s@,;]+\.[a-z]{2,}$/i;

// Durée d'affichage des scènes (ms)
const DUREES = { accueil: 15000, ville: 12000, comment: 11000 };
// Veille (s) : ce qui se referme sans geste du visiteur
const VEILLE = { couche: 75, prevenir: 10, saisie: 45, reprise: 20 };
// Hygiène mémoire : la page se recharge d'elle-même, seulement à un moment calme
const RECHARGE = { apresMs: 3 * 3600 * 1000, calmeMs: 10 * 60 * 1000 };
// Délai accordé à une vue aérienne avant de montrer la scène sans elle (ms)
const ATTENTE_IMAGE_MS = 4000;

let catalogue = { villes: [], lyon: null, totaux: {} };
const parSlug = new Map();
let vitrine = [];

/* ─── Adresses ─── */

function urlAccueil() {
  const u = new URL('/cartes/', window.location.origin);
  u.searchParams.set('kiosk', '1');
  if (CLE) u.searchParams.set('k', CLE);
  return u.pathname + u.search;
}

/* L'écran de génération. Sur le stand, il reçoit l'adresse de retour : c'est
   lui qui ramène ici à la fin, ou après un abandon. */
function urlDemo(commune) {
  const u = new URL('/demo/', window.location.origin);
  if (commune?.code) {
    u.searchParams.set('commune', commune.code);
    u.searchParams.set('nom', commune.nom || '');
    u.searchParams.set('auto', '1');
  }
  if (KIOSK) {
    u.searchParams.set('kiosk', '1');
    if (CLE) u.searchParams.set('k', CLE);
    u.searchParams.set('retour', urlAccueil());
  }
  return u.pathname + u.search;
}

const mesurer = (evenement, props) => window.OPAnalytics?.capture?.(evenement, props);
const orientation = () => (window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'paysage');

/* ─── Le catalogue ─── */

function lireEmbarque() {
  try {
    const texte = ($('catalogue')?.textContent || '').trim();
    if (!texte.startsWith('{')) return null;
    const c = JSON.parse(texte);
    return c && Array.isArray(c.villes) ? c : null;
  } catch {
    return null;
  }
}

/* Le pré-rendu a manqué : la page se remplit elle-même, avec les mêmes
   fonctions de rendu que le serveur. */
function remplirDepuisLeClient(c) {
  const liste = [c.lyon, ...c.villes].filter(Boolean);
  $('points').innerHTML = liste.map(renderPoint).join('');
  $('communes-liste').innerHTML = liste.map(renderCommune).join('');
  const vedette = villeVedette(c);
  if (vedette) $('scene-ville').innerHTML = renderVille(vedette);
  const lyon = document.querySelector('.lyon__inner');
  if (lyon && c.lyon) lyon.innerHTML = renderVille(c.lyon, { lyon: true });
  const compte = renderCompte(c.totaux);
  if (compte) {
    $('compte').innerHTML = compte;
    $('compte').hidden = false;
  }
}

async function obtenirCatalogue() {
  const embarque = lireEmbarque();
  if (embarque) return embarque;
  const c = await chargerCatalogue();
  remplirDepuisLeClient(c);
  return c;
}

/* ─── Le ciel : la France, puis chaque commune, vues d'en haut ─── */

const ciel = (() => {
  const racine = $('ciel');
  const france = $('ciel-france');
  const imageFrance = $('ciel-france-image');
  const constellation = $('constellation');
  const calquesVille = [$('ciel-ville-a'), $('ciel-ville-b')];
  const nuit = $('ciel-nuit');
  let calqueCourant = -1;
  let vueCourante = '';
  const prechargees = new Map();

  /* Le cadre couvre le ciel sans déformer l'image : même règle qu'object-fit
     cover, mais partagée avec la constellation, qui doit rester alignée. */
  function dimensionner() {
    const vue = VUES_FRANCE[vueCourante] || VUES_FRANCE.paysage;
    const ratio = vue.largeur / vue.hauteur;
    const L = racine.clientWidth || window.innerWidth;
    const H = racine.clientHeight || window.innerHeight;
    let l = L;
    let h = L / ratio;
    if (h < H) { h = H; l = H * ratio; }
    racine.querySelectorAll('.ciel__cadre').forEach((cadre) => {
      cadre.style.width = `${Math.ceil(l)}px`;
      cadre.style.height = `${Math.ceil(h)}px`;
    });
  }

  function poserFrance() {
    const o = orientation();
    if (o === vueCourante) return;
    vueCourante = o;
    imageFrance.src = urlFrance(o);
    constellation.setAttribute('viewBox', viewBoxDe(VUES_FRANCE[o]));
    dimensionner();
  }

  function precharger(v) {
    const url = v ? urlAerienne(v.lat, v.lng, vueCourante) : '';
    if (!url || prechargees.has(url)) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    prechargees.set(url, img);
    if (prechargees.size > 24) prechargees.delete(prechargees.keys().next().value);
  }

  function attendre(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve(true);
    return new Promise((resolve) => {
      const fin = (ok) => { clearTimeout(minuteur); resolve(ok); };
      const minuteur = setTimeout(() => fin(false), ATTENTE_IMAGE_MS);
      img.addEventListener('load', () => fin(true), { once: true });
      img.addEventListener('error', () => fin(false), { once: true });
    });
  }

  /* Plonger sur une commune : la France grossit vers son point et s'efface,
     la vue aérienne arrive d'un peu plus près et se pose. D'une commune à
     l'autre, les deux calques se relaient. */
  async function versVille(v) {
    const url = urlAerienne(v.lat, v.lng, vueCourante);
    const suivant = (calqueCourant + 1) % 2;
    const calque = calquesVille[suivant];
    const img = calque.querySelector('img');
    let prete = false;
    if (url) {
      if (img.src !== url) img.src = url;
      prete = await attendre(img);
    }
    calque.classList.toggle('is-sans-image', !prete);
    if (!prete && url) {
      // L'image arrive en retard : elle prend sa place dès qu'elle est là,
      // tant que ce calque montre encore cette commune
      img.addEventListener('load', () => { if (img.src === url) calque.classList.remove('is-sans-image'); }, { once: true });
    }
    calque.style.setProperty('--ville', v.couleur || 'var(--brand)');
    if (calqueCourant >= 0) calquesVille[calqueCourant].classList.remove('is-on');
    calque.classList.add('is-on');
    calqueCourant = suivant;
    if (france.classList.contains('is-on')) {
      const p = v.lat != null ? positionDansVue(v.lat, v.lng, VUES_FRANCE[vueCourante] || VUES_FRANCE.paysage) : { x: 0.5, y: 0.5 };
      france.style.transformOrigin = `${(p.x * 100).toFixed(2)}% ${(p.y * 100).toFixed(2)}%`;
      france.classList.add('is-plongee');
      france.classList.remove('is-on');
    }
    nuit.classList.remove('is-on');
  }

  /* Remonter vers la France : la commune s'efface, la France reprend sa place */
  function versFrance({ nuitTombee = false } = {}) {
    if (calqueCourant >= 0) {
      calquesVille[calqueCourant].classList.remove('is-on');
      calqueCourant = -1;
    }
    france.classList.remove('is-plongee');
    france.classList.add('is-on');
    nuit.classList.toggle('is-on', nuitTombee);
  }

  return {
    demarrer() {
      poserFrance();
      window.addEventListener('resize', () => {
        // Un changement d'orientation change les cadres : la page repart propre
        if (orientation() !== vueCourante && KIOSK) { window.location.reload(); return; }
        dimensionner();
      });
    },
    precharger,
    versVille,
    versFrance,
    nuit(active) { nuit.classList.toggle('is-on', !!active); },
    get vue() { return vueCourante; },
  };
})();

/* Le point d'une commune sur la France : allumé, et passé au premier plan */
function allumerPoint(slug) {
  document.querySelectorAll('.point.is-on').forEach((p) => p.classList.remove('is-on'));
  if (!slug) return;
  const p = document.querySelector(`.point[data-ville="${CSS.escape(slug)}"]`);
  if (!p) return;
  p.classList.add('is-on');
  p.parentNode.appendChild(p);
}

/* Sur l'accueil, la France vit à peine : un point s'allume de temps en temps,
   un seul à la fois. Un petit cercle repeint, rien d'autre. */
const scintillement = (() => {
  let minuteur = null;
  function pas() {
    const points = document.querySelectorAll('.point');
    if (!points.length) return;
    allumerPoint(points[Math.floor(Math.random() * points.length)].dataset.ville);
    minuteur = setTimeout(pas, 1300);
  }
  return {
    demarrer() { this.arreter(); minuteur = setTimeout(pas, 700); },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
})();

/* Les totaux montent jusqu'à leur valeur à chaque retour à l'accueil */
function compterJusqua() {
  const cibles = document.querySelectorAll('#compte b[data-compte]');
  if (!cibles.length) return;
  const debut = performance.now();
  const duree = 1100;
  const format = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function pas(t) {
    const x = Math.min(1, (t - debut) / duree);
    const e = 1 - (1 - x) ** 3;
    cibles.forEach((b) => { b.textContent = format(Number(b.dataset.compte) * e); });
    if (x < 1) requestAnimationFrame(pas);
  }
  requestAnimationFrame(pas);
}

/* ─── Les scènes ─── */

function precharger(v) {
  if (!v) return;
  ciel.precharger(v);
  v.fiches.slice(0, 3).forEach((f) => {
    if (!f.image) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = f.image;
  });
  if (v.logo) {
    const logo = new Image();
    logo.src = v.logo;
  }
}

function activer(section) {
  document.querySelectorAll('.scene.is-active').forEach((s) => s.classList.remove('is-active'));
  // Réinsérer le texte relance ses animations d'arrivée
  section.classList.add('is-active');
}

async function montrer(scene) {
  scintillement.arreter();
  if (scene.type === 'ville') {
    const v = scene.ville;
    const section = $('scene-ville');
    section.innerHTML = renderVille(v, { lyon: !!scene.lyon });
    allumerPoint(v.slug);
    document.body.dataset.scene = 'ville';
    await ciel.versVille(v);
    activer(section);
    return;
  }
  allumerPoint(null);
  document.body.dataset.scene = scene.type;
  ciel.versFrance({ nuitTombee: scene.type === 'comment' });
  activer(scene.type === 'comment' ? $('scene-comment') : $('scene-accueil'));
  if (scene.type === 'accueil') {
    scintillement.demarrer();
    compterJusqua();
  }
}

/* Le ruban avance d'un écran à chaque scène : au fil de la rotation, toutes
   les communes passent sous les yeux. */
function fairePasserLeRuban() {
  const liste = $('communes-liste');
  if (!liste || liste.scrollWidth <= liste.clientWidth) return;
  const pas = Math.round(liste.clientWidth * 0.6);
  const fin = liste.scrollLeft + liste.clientWidth >= liste.scrollWidth - 4;
  liste.scrollTo({ left: fin ? 0 : liste.scrollLeft + pas, behavior: 'smooth' });
}

/* La rotation : l'accueil, trois communes tirées au sort dans la vitrine, puis
   en alternance « comment ça marche » et la Métropole de Lyon. Une seule
   chaîne de minuteurs. Reprendre, c'est toujours repartir de l'accueil. */
const boucle = (() => {
  let minuteur = null;
  let arretee = true;
  let suspendue = false;
  let tour = 0;
  let paquet = [];
  let file = [];
  let jeton = 0;

  function melanger(a) {
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function piocher(n) {
    const sortie = [];
    while (sortie.length < n) {
      if (!paquet.length) {
        paquet = melanger(vitrine.slice());
        if (!paquet.length) break;
      }
      sortie.push(paquet.shift());
    }
    return sortie;
  }

  function programme() {
    const seq = [{ type: 'accueil' }];
    for (const v of piocher(3)) seq.push({ type: 'ville', ville: v });
    if (tour % 2 === 1 && catalogue.lyon) seq.push({ type: 'ville', ville: catalogue.lyon, lyon: true });
    else seq.push({ type: 'comment' });
    tour += 1;
    return seq;
  }

  async function avancer() {
    if (!file.length) file = programme();
    const scene = file.shift();
    const suivante = file[0];
    if (suivante?.type === 'ville') precharger(suivante.ville);
    const mien = ++jeton;
    await montrer(scene);
    // Une pause ou un arrêt survenu pendant l'attente de l'image l'emporte
    if (mien !== jeton || arretee || suspendue) return;
    fairePasserLeRuban();
    minuteur = setTimeout(avancer, DUREES[scene.type] || 10000);
  }

  return {
    demarrer() {
      clearTimeout(minuteur);
      arretee = false;
      suspendue = false;
      file = [];
      avancer();
    },
    arreter() {
      clearTimeout(minuteur);
      minuteur = null;
      arretee = true;
      suspendue = false;
      jeton += 1;
      scintillement.arreter();
    },
    // Un geste du visiteur : la scène en cours reste, le temps qu'il lise
    suspendre() {
      if (arretee || suspendue) return;
      clearTimeout(minuteur);
      minuteur = null;
      suspendue = true;
      jeton += 1;
    },
    reprendre() {
      if (!arretee && !suspendue) return;
      this.demarrer();
    },
    get suspendue() { return suspendue; },
    get arretee() { return arretee; },
  };
})();

/* ─── Le rappel avant le retour ─── */

const rappel = {
  montrer(secondes) {
    $('veille-s').textContent = String(secondes);
    $('veille').hidden = false;
  },
  cacher() {
    if (!$('veille').hidden) $('veille').hidden = true;
  },
};

/* ─── La veille ─── */

const couche = { ouverte: false, slug: '', nom: '' };
const saisie = { ouverte: false };

/* Un seul minuteur, une fois par seconde, qui regarde depuis combien de temps
   personne n'a touché l'écran et referme ce qui doit l'être. */
const veille = (() => {
  let dernierGeste = Date.now();
  const debut = Date.now();
  let erreur = false;
  const GESTES = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

  function toucher() {
    dernierGeste = Date.now();
    if (!couche.ouverte && !saisie.ouverte) boucle.suspendre();
  }

  function tic() {
    const calme = (Date.now() - dernierGeste) / 1000;
    if (couche.ouverte) {
      const reste = VEILLE.couche - calme;
      if (reste <= 0) fermerCouche('veille');
      else if (reste <= VEILLE.prevenir) rappel.montrer(Math.ceil(reste));
      else rappel.cacher();
      return;
    }
    rappel.cacher();
    if (saisie.ouverte) {
      if (calme >= VEILLE.saisie) fermerSaisie('veille');
      return;
    }
    if (boucle.suspendue && calme >= VEILLE.reprise) boucle.reprendre();
    // Un script en erreur ne doit jamais laisser l'écran figé : on repart à neuf
    if (erreur && calme >= 60) window.location.replace(urlAccueil());
    if (Date.now() - debut >= RECHARGE.apresMs && calme * 1000 >= RECHARGE.calmeMs) window.location.replace(urlAccueil());
  }

  return {
    toucher,
    demarrer() {
      GESTES.forEach((ev) => window.addEventListener(ev, toucher, { passive: true, capture: true }));
      window.addEventListener('error', () => { erreur = true; });
      setInterval(tic, 1000);
    },
    // Les gestes faits DANS la carte ouverte comptent aussi
    brancher(fenetre) {
      try {
        GESTES.forEach((ev) => fenetre.addEventListener(ev, toucher, { passive: true, capture: true }));
      } catch { /* document inaccessible : la veille compte sans lui */ }
    },
  };
})();

/* ─── La couche : une carte ouverte par-dessus l'accueil ─── */

const cadre = $('couche-cadre');

function nomDe(slug, nom) {
  if (nom) return nom;
  if (slug === VILLE_LYON) return 'Métropole de Lyon';
  return parSlug.get(slug)?.nom || nomDepuisSlug(slug);
}

function ouvrirCouche(slug, nom, origine) {
  if (!SLUG_RE.test(slug || '')) return;
  boucle.arreter();
  fermerSaisie();
  couche.ouverte = true;
  couche.slug = slug;
  couche.nom = nomDe(slug, nom);
  $('couche-nom').textContent = couche.nom;
  const logo = $('couche-logo');
  const src = parSlug.get(slug)?.logo || '';
  logo.hidden = !src;
  if (src) logo.src = src;
  emporter.fermer();
  cadre.src = `/${encodeURIComponent(slug)}`;
  $('couche').hidden = false;
  document.body.classList.add('is-couche');
  veille.toucher();
  mesurer('cartes_ville_ouverte', { ville: slug, origine });
}

function fermerCouche(motif) {
  if (!couche.ouverte) return;
  couche.ouverte = false;
  emporter.fermer();
  rappel.cacher();
  // src vidé : la carte rend sa mémoire (WebGL compris) au lieu de la garder
  cadre.src = 'about:blank';
  $('couche').hidden = true;
  document.body.classList.remove('is-couche');
  if (PARAMS.has('ouvrir')) {
    PARAMS.delete('ouvrir');
    PARAMS.delete('nom');
    window.history.replaceState(null, '', urlAccueil());
  }
  if (motif === 'veille') mesurer('cartes_retour_veille', { depuis: 'carte', ville: couche.slug });
  if (KIOSK) boucle.reprendre();
}

/* La carte tourne dans une iframe de MÊME origine : on peut y poser nos
   écouteurs. Rien ne doit en sortir : les liens vers d'autres sites sont
   neutralisés, les nouveaux onglets ramenés dans le cadre. */
cadre.addEventListener('load', () => {
  let doc;
  try {
    doc = cadre.contentDocument;
  } catch {
    return;
  }
  if (!doc || !cadre.src || cadre.src === 'about:blank') return;
  veille.brancher(doc);
  doc.addEventListener('click', (e) => {
    // Pas de instanceof ici : les éléments du cadre viennent d'un autre monde
    // JavaScript, leur classe Element n'est pas la nôtre
    const a = typeof e.target?.closest === 'function' ? e.target.closest('a[href]') : null;
    if (!a) return;
    let cible;
    try {
      cible = new URL(a.getAttribute('href') || '', doc.baseURI);
    } catch {
      return;
    }
    if (cible.origin !== window.location.origin) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (a.target === '_blank') a.target = '_self';
  }, true);
  try {
    cadre.contentWindow.open = (url) => {
      try {
        const u = new URL(String(url || ''), doc.baseURI);
        if (u.origin === window.location.origin) cadre.contentWindow.location.href = u.href;
      } catch { /* adresse illisible : ignorée */ }
      return null;
    };
  } catch { /* fenêtre inaccessible */ }
});

$('couche-retour').addEventListener('click', () => fermerCouche('bouton'));

/* ─── Emporter la carte : un code à scanner, ou le lien par e-mail ─── */

const emporter = (() => {
  const el = $('emporter');
  const form = $('emporter-form');
  const champ = $('emporter-email');
  const bouton = $('emporter-envoyer');
  const erreur = $('emporter-erreur');
  const merci = $('emporter-merci');

  function montrerErreur(message) {
    erreur.textContent = message || '';
    erreur.hidden = !message;
  }

  function ouvrir() {
    const slug = couche.slug;
    $('emporter-nom').textContent = couche.nom;
    // Le lien de l'espace, tel que l'e-mail de la démo le donne
    const lien = `${BASE_ORIGIN}/?city=${encodeURIComponent(slug)}`;
    $('emporter-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=6&data=${encodeURIComponent(lien)}`;
    // Seules les cartes d'essai s'envoient par e-mail : l'API n'accepte qu'elles
    const avecMail = slug.startsWith(PREFIXE_ESSAI);
    el.classList.toggle('is-sans-mail', !avecMail);
    form.reset();
    montrerErreur('');
    merci.hidden = true;
    champ.disabled = false;
    bouton.disabled = false;
    el.hidden = false;
    // Le focus est donné DANS le geste : Android n'ouvre son clavier qu'ainsi
    if (avecMail) champ.focus();
  }

  function fermer() {
    if (!el.hidden) el.hidden = true;
  }

  async function envoyer(e) {
    e.preventDefault();
    const email = champ.value.trim();
    if (!EMAIL_RE.test(email)) {
      montrerErreur('Cette adresse ne semble pas complète. Vérifiez-la, par exemple prenom.nom@ville.fr.');
      return;
    }
    montrerErreur('');
    champ.disabled = true;
    bouton.disabled = true;
    try {
      const r = await fetch('/api/demo-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          ville: couche.slug,
          communeNom: couche.nom,
          projectsCount: parSlug.get(couche.slug)?.total ?? null,
          kiosk: KIOSK,
        }),
      });
      const data = r.ok ? await r.json().catch(() => null) : null;
      if (!data?.ok) throw new Error(String(r.status));
      // On ne promet un envoi que s'il a eu lieu
      merci.textContent = data.mailed ? 'Merci, le lien part sur votre adresse.' : 'Merci, nous avons bien votre adresse.';
      merci.hidden = false;
      mesurer('cartes_adresse_laissee', { ville: couche.slug, envoye: !!data.mailed });
    } catch {
      champ.disabled = false;
      bouton.disabled = false;
      montrerErreur('Nous n\'avons pas pu enregistrer votre adresse. Réessayez, ou scannez le code.');
    }
  }

  form.addEventListener('submit', envoyer);
  $('emporter-fermer').addEventListener('click', fermer);
  el.addEventListener('click', (e) => { if (e.target === el) fermer(); });
  $('couche-emporter').addEventListener('click', () => { if (el.hidden) ouvrir(); else fermer(); });

  return { ouvrir, fermer };
})();

/* ─── La recherche ─── */

/* Autocomplétion officielle (geo.api.gouv.fr). Les réponses n'arrivent pas
   dans l'ordre des frappes : un compteur écarte celles qui sont dépassées. */
const geo = (() => {
  let minuteur = null;
  let sequence = 0;
  function chercher(texte, rendre) {
    clearTimeout(minuteur);
    const q = String(texte || '').trim();
    if (q.length < 2) {
      sequence += 1;
      rendre(null);
      return;
    }
    minuteur = setTimeout(async () => {
      sequence += 1;
      const seq = sequence;
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=departement,centre,population&boost=population&limit=6`);
        const liste = r.ok ? await r.json() : [];
        if (seq !== sequence) return;
        rendre(Array.isArray(liste) ? liste : []);
      } catch {
        if (seq === sequence) rendre([]);
      }
    }, 220);
  }
  return { chercher };
})();

/* Même construction de slug que l'écran de génération, pour retrouver la carte
   d'une commune déjà passée par là (« Vandœuvre-lès-Nancy » donne
   « vandoeuvre-les-nancy »). */
function slugDeCommune(nom) {
  return String(nom || '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/* La carte de cette commune existe-t-elle déjà ? Le nom donne le slug, la
   position départage les homonymes (Saint-Denis en Seine-Saint-Denis et
   Saint-Denis de La Réunion). */
function correspondance(commune) {
  const v = parSlug.get(PREFIXE_ESSAI + slugDeCommune(commune?.nom));
  if (!v) return null;
  const c = commune?.centre?.coordinates;
  if (v.lat != null && v.lng != null && Array.isArray(c) && c.length === 2) {
    if (distanceKm(v.lat, v.lng, Number(c[1]), Number(c[0])) > 25) return null;
  }
  return v;
}

function renderSuggestion(commune, index) {
  const v = correspondance(commune);
  const li = document.createElement('li');
  li.setAttribute('role', 'option');
  li.dataset.index = String(index);
  const nom = document.createElement('span');
  nom.className = 's-nom';
  nom.textContent = commune.nom;
  const dep = document.createElement('span');
  dep.className = 's-dep';
  dep.textContent = commune.departement?.nom || '';
  const etat = document.createElement('span');
  etat.className = v ? 's-etat s-etat--existe' : 's-etat';
  // La durée annoncée dépend de la taille de la commune
  etat.textContent = v ? 'Sa carte existe, elle s\'ouvre' : `À construire, ${dureeEstimee(commune.population).texte}`;
  li.append(nom, dep, etat);
  return li;
}

function renderVide(liste) {
  const li = document.createElement('li');
  li.className = 'is-vide';
  li.textContent = 'Aucune commune ne porte ce nom. Vérifiez l\'orthographe.';
  liste.replaceChildren(li);
}

function choisir(commune) {
  if (!commune) return;
  const v = correspondance(commune);
  if (v) {
    if (KIOSK) ouvrirCouche(v.slug, v.nom, 'recherche');
    else window.location.href = `/${encodeURIComponent(v.slug)}`;
    return;
  }
  mesurer('cartes_generation_lancee', { commune: commune.code || null, population: commune.population || null, kiosk: KIOSK });
  window.location.href = urlDemo(commune);
}

/* Un champ, une liste, un clavier : la même mécanique sert la recherche du
   site et la saisie plein écran du stand. */
function lierChamp({ champ, liste, auChoix }) {
  let communes = [];
  let index = -1;

  function marquer() {
    [...liste.children].forEach((li, i) => li.classList.toggle('is-selected', i === index));
  }

  function rendre(resultats) {
    index = -1;
    if (resultats === null) {
      communes = [];
      liste.replaceChildren();
      liste.hidden = true;
      return;
    }
    communes = resultats;
    if (!communes.length) {
      renderVide(liste);
    } else {
      liste.replaceChildren(...communes.map(renderSuggestion));
    }
    liste.hidden = false;
  }

  champ.addEventListener('input', () => geo.chercher(champ.value, rendre));
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!communes.length) return;
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + communes.length) % communes.length;
      marquer();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      auChoix(communes[index] || communes[0] || null);
    } else if (e.key === 'Escape') {
      rendre(null);
    }
  });
  // mousedown : le choix est fait avant que le champ ne perde le focus
  liste.addEventListener('mousedown', (e) => {
    const li = e.target instanceof Element ? e.target.closest('li[data-index]') : null;
    if (!li) return;
    e.preventDefault();
    auChoix(communes[Number(li.dataset.index)] || null);
  });

  return {
    vider() { champ.value = ''; rendre(null); },
    premiere() { return communes[index] || communes[0] || null; },
  };
}

/* ─── La saisie plein écran (stand) ─── */

let saisieChamp = null;

/* Le champ prend le focus DANS le geste du visiteur : Android n'ouvre son
   clavier que si le focus est donné pendant un appui, jamais après coup. */
function ouvrirSaisie() {
  if (saisie.ouverte) return;
  saisie.ouverte = true;
  boucle.arreter();
  ciel.nuit(true);
  // Le ciel reste visible derrière, la scène et le ruban s'effacent
  document.body.classList.add('is-saisie');
  $('saisie').hidden = false;
  saisieChamp?.vider();
  $('saisie-champ').focus();
  veille.toucher();
}

function fermerSaisie(motif) {
  if (!saisie.ouverte) return;
  saisie.ouverte = false;
  $('saisie').hidden = true;
  document.body.classList.remove('is-saisie');
  ciel.nuit(document.body.dataset.scene === 'comment');
  $('saisie-champ').blur();
  if (motif === 'veille') mesurer('cartes_retour_veille', { depuis: 'saisie' });
  if (KIOSK && !couche.ouverte) boucle.reprendre();
}

function lierRecherche() {
  const champ = $('recherche-champ');
  const form = $('recherche');
  if (KIOSK) {
    // Sur le stand, le champ de la page n'est qu'une porte : la saisie se fait
    // plein écran, avec le clavier de la tablette en bas
    champ.readOnly = true;
    champ.addEventListener('click', (e) => { e.preventDefault(); ouvrirSaisie(); });
    champ.addEventListener('focus', () => { champ.blur(); ouvrirSaisie(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); ouvrirSaisie(); });
    saisieChamp = lierChamp({ champ: $('saisie-champ'), liste: $('saisie-suggestions'), auChoix: choisir });
    $('saisie-fermer').addEventListener('click', () => fermerSaisie('bouton'));
    return;
  }
  const inline = lierChamp({ champ, liste: $('recherche-suggestions'), auChoix: choisir });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const c = inline.premiere();
    if (c) choisir(c);
    else geo.chercher(champ.value, (r) => { if (r && r.length) choisir(r[0]); });
  });
  champ.addEventListener('blur', () => setTimeout(() => { $('recherche-suggestions').hidden = true; }, 150));
  champ.addEventListener('focus', () => { if ($('recherche-suggestions').children.length) $('recherche-suggestions').hidden = false; });
}

/* ─── Le stand ─── */

let verrouEcran = null;
async function garderAllume() {
  try {
    if (!navigator.wakeLock) return;
    if (!verrouEcran || verrouEcran.released) verrouEcran = await navigator.wakeLock.request('screen');
  } catch { /* refusé : la tablette gère elle-même sa mise en veille */ }
}

function initPleinEcran() {
  const bouton = $('plein-ecran');
  if (!document.fullscreenEnabled) return;
  const maj = () => { bouton.hidden = !!document.fullscreenElement; };
  bouton.addEventListener('click', () => {
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {});
  });
  document.addEventListener('fullscreenchange', maj);
  maj();
}

/* Sur le stand, aucun lien ne quitte la page : ceux qui désignent une commune
   ouvrent sa carte en couche, les autres sont inertes. */
function neutraliserLiens() {
  document.addEventListener('click', (e) => {
    if (couche.ouverte) return;
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!a) return;
    e.preventDefault();
    const porteur = a.closest('[data-ville]');
    const slug = a.dataset.ville || porteur?.dataset.ville || '';
    if (!slug) return;
    const nom = a.dataset.nom || porteur?.dataset.nom || '';
    ouvrirCouche(slug, nom, a.classList.contains('commune__lien') ? 'ruban' : 'scene');
  }, true);
}

function initKiosque() {
  document.body.classList.add('is-kiosk');
  document.body.dataset.scene = 'accueil';
  neutraliserLiens();
  initPleinEcran();
  garderAllume();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') garderAllume();
  });
  veille.demarrer();
  boucle.demarrer();

  // Retour de l'écran de génération : la carte qui vient d'être construite
  // s'ouvre tout de suite, même si le catalogue ne la connaît pas encore
  const ouvrir = (PARAMS.get('ouvrir') || '').toLowerCase();
  if (OUVRABLE_RE.test(ouvrir)) ouvrirCouche(ouvrir, (PARAMS.get('nom') || '').slice(0, 120), 'generation');
}

/* ─── Démarrage ─── */

async function init() {
  ciel.demarrer();
  try {
    catalogue = await obtenirCatalogue();
  } catch (e) {
    console.error('[cartes] catalogue indisponible :', e?.message || e);
  }
  for (const v of catalogue.villes) parSlug.set(v.slug, v);
  if (catalogue.lyon) parSlug.set(catalogue.lyon.slug, catalogue.lyon);
  vitrine = catalogue.villes.filter((v) => v.vitrine && v.fiches.some((f) => f.image));
  lierRecherche();
  if (KIOSK) initKiosque();
  // Poignée pour les vérifications de mise en page (tests, audit) : forcer une scène
  window.__cartes = {
    montrer: (type, slug) => {
      if (type === 'ville') {
        const v = slug ? parSlug.get(slug) : vitrine[0];
        return v ? montrer({ type: 'ville', ville: v, lyon: v.slug === VILLE_LYON }) : Promise.resolve();
      }
      return montrer({ type });
    },
    vitrine: () => vitrine.map((v) => v.slug),
    arreter: () => boucle.arreter(),
  };
}

init();

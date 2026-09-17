/* ============================================================================
   COMPOSITION - carte-postale/postcard.js  (window.Postcard)

   Fabrique l'image finale : 100 x 148 mm à 300 points par pouce, soit
   1181 x 1748 pixels. Tout est peint dans un canvas plutôt que confié à
   l'impression du navigateur, pour une raison simple : une page imprimée
   dépend des marges, du navigateur et du pilote. Une image, non. Ce qui est
   téléchargé et ce qui sort de l'imprimante sont alors le même objet.
   ============================================================================ */
(() => {
  'use strict';

  const DPI = 300;
  const MM = DPI / 25.4;
  const L = Math.round(100 * MM);  // 1181
  const H = Math.round(148 * MM);  // 1748
  /* Part de l'image dans la hauteur. DOIT rester égale à --cp-image de la
     feuille de style, sinon l'aperçu à l'écran et le papier ne cadrent pas
     pareil et l'inscription se décale. */
  const IMAGE_H = Math.round(H * 0.70);
  const MARGE = Math.round(L * 0.066);
  const PRINT_SAFE_MARGIN = Math.ceil(5 * MM);

  const PAPIER = '#f7f5f1';
  const ENCRE = '#12121a';
  const GRIS = '#5d5d6b';

  const LOGO = '/img/logos/classic_color.png';
  // Même contact et même QR pour l'aperçu et le papier. Le SVG embarqué encode
  // cette adresse et garde une zone blanche de quatre modules sur chaque côté.
  const CONTACT = Object.freeze({
    email: 'contact@vazy.app',
    phone: '07 60 77 16 13',
    url: 'https://openprojets.com/l/carte-postale',
    qrImage: '/carte-postale/qr-carte-postale.svg',
  });

  function charger(src) {
    return new Promise((ok) => {
      const img = new Image();
      // Sans cela, le canvas serait « teinté » et refuserait de rendre l'image
      img.crossOrigin = 'anonymous';
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = src;
    });
  }

  // Dessine un texte sur plusieurs lignes, en respectant les retours forcés
  function lignes(ctx, texte, largeurMax) {
    const sortie = [];
    for (const paragraphe of String(texte || '').split('\n')) {
      let courante = '';
      for (const mot of paragraphe.split(' ')) {
        const essai = courante ? `${courante} ${mot}` : mot;
        if (ctx.measureText(essai).width > largeurMax && courante) {
          sortie.push(courante);
          courante = mot;
        } else {
          courante = essai;
        }
      }
      sortie.push(courante);
    }
    return sortie;
  }

  function ecrire(ctx, texte, x, y, largeurMax, interligne) {
    for (const [i, ligne] of lignes(ctx, texte, largeurMax).entries()) {
      ctx.fillText(ligne, x, y + i * interligne);
    }
  }

  // Remplit la zone en conservant les proportions de la source (comme `cover`)
  function couvrir(ctx, img, x, y, l, h) {
    const r = Math.max(l / img.width, h / img.height);
    const il = img.width * r;
    const ih = img.height * r;
    ctx.drawImage(img, x + (l - il) / 2, y + (h - ih) / 2, il, ih);
  }

  const Postcard = {
    contact: CONTACT,
    largeur: L,
    hauteur: H,
    // Proportions de la zone image, pour que la capture ait le bon cadrage
    imageLargeur: L,
    imageHauteur: IMAGE_H,

    /* Les polices doivent être RÉELLEMENT chargées avant de peindre : un canvas
       ne patiente pas, il dessinerait avec la police de repli sans prévenir. */
    async policesPretes() {
      if (!document.fonts) return;
      await Promise.all([
        document.fonts.load('700 48px "Space Grotesk"'),
        document.fonts.load('600 54px "Space Grotesk"'),
        document.fonts.load('400 25px "Inter"'),
      ]).catch(() => {});
      await document.fonts.ready;
    },

    async composer({ imageCarte, inscription, punchline }) {
      await Postcard.policesPretes();
      const c = document.createElement('canvas');
      c.width = L;
      c.height = H;
      const ctx = c.getContext('2d');

      ctx.fillStyle = PAPIER;
      ctx.fillRect(0, 0, L, H);

      /* ── L'image ── */
      const fond = imageCarte ? await charger(imageCarte) : null;
      if (fond) {
        couvrir(ctx, fond, 0, 0, L, IMAGE_H);
      } else {
        ctx.fillStyle = '#0d1420';
        ctx.fillRect(0, 0, L, IMAGE_H);
      }

      // Voile bas : il détache l'inscription quelle que soit la photo dessous
      const voile = ctx.createLinearGradient(0, IMAGE_H * 0.54, 0, IMAGE_H);
      voile.addColorStop(0, 'rgba(6,10,18,0)');
      voile.addColorStop(1, 'rgba(6,10,18,0.86)');
      ctx.fillStyle = voile;
      ctx.fillRect(0, IMAGE_H * 0.54, L, IMAGE_H * 0.46);

      /* ── Inscription, posée sur l'image ── */
      if (inscription) {
        ctx.font = '600 54px "Space Grotesk", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'alphabetic';
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 3;
        const largeurTexte = L - MARGE * 2;
        const l = lignes(ctx, inscription, largeurTexte);
        const base = IMAGE_H - 74 - (l.length - 1) * 64;
        ecrire(ctx, inscription, MARGE, base, largeurTexte, 64);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }

      // Le bandeau accueille le logo, l'accroche, le contact et un QR de 24 mm.
      const yB = IMAGE_H;
      const hB = H - IMAGE_H;
      ctx.fillStyle = PAPIER;
      ctx.fillRect(0, yB, L, hB);

      const qrTaille = Math.round(24 * MM);
      const qrX = L - MARGE - qrTaille;
      const colonne = qrX - MARGE - 40;

      /* Le logo, EN COULEUR, ouvre le bandeau : c'est la seule note vive de
         l'objet et elle signe qui l'a fabriqué. Sur le papier crème il ressort
         sans retouche. */
      let y = yB + Math.round(L * 0.03);
      const logo = await charger(LOGO);
      if (logo) {
        const lLogo = Math.round(L * 0.22);
        const hLogo = Math.round((logo.height / logo.width) * lLogo);
        ctx.drawImage(logo, MARGE, y, lLogo, hLogo);
        y += hLogo + 52;
      } else {
        y += 40;
      }

      // Punchline
      ctx.textBaseline = 'alphabetic';
      ctx.font = '700 48px "Space Grotesk", sans-serif';
      ctx.fillStyle = ENCRE;
      const lignesPunch = lignes(ctx, punchline || '', colonne);
      ecrire(ctx, punchline || '', MARGE, y, colonne, 62);
      y += (lignesPunch.length - 1) * 62 + 90;

      // Le contact est détaché de l'accroche pour rester facile à repérer.
      ctx.font = '600 38px "Space Grotesk", sans-serif';
      ctx.fillStyle = ENCRE;
      ctx.fillText(CONTACT.email, MARGE, y);
      ctx.fillText(CONTACT.phone, MARGE, y + 48);

      // QR et sa légende, centrés verticalement dans le bandeau
      const qr = await charger(CONTACT.qrImage);
      if (!qr) throw new Error('Le QR code de la carte postale est indisponible.');
      const qrY = yB + Math.round((hB - (qrTaille + 42)) / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qr, qrX, qrY, qrTaille, qrTaille);
      ctx.imageSmoothingEnabled = true;
      ctx.font = '400 28px "Inter", sans-serif';
      ctx.fillStyle = GRIS;
      ctx.textAlign = 'center';
      ctx.fillText(new URL(CONTACT.url).hostname, qrX + qrTaille / 2, qrY + qrTaille + 34);
      ctx.textAlign = 'left';

      // La mention IGN garde 5 mm de sécurité sous les lettres descendantes.
      ctx.font = '400 24px "Inter", sans-serif';
      ctx.fillStyle = GRIS;
      const credit = 'Fond de carte © IGN, Géoplateforme';
      const creditDescent = ctx.measureText(credit).actualBoundingBoxDescent;
      ctx.fillText(credit, MARGE, H - PRINT_SAFE_MARGIN - creditDescent);

      return c;
    },

    telecharger(canvas, nom) {
      const a = document.createElement('a');
      a.download = `${nom}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    },

    /* L'impression ne montre QUE cette image, au format exact de la carte.
       Voir la règle @page de la feuille de style. */
    async imprimer(canvas) {
      const img = new Image();
      img.id = 'sortie-img';
      img.alt = 'Carte postale prête à imprimer';
      const boite = document.getElementById('sortie');
      img.src = canvas.toDataURL('image/png');
      // L'image doit être décodée avant l'ouverture de l'aperçu d'impression.
      await img.decode();
      boite.replaceChildren(img);
      boite.hidden = false;
      // Certains navigateurs rendent la main avant la fermeture du dialogue :
      // aucun minuteur ne doit retirer la carte pendant que l'on choisit le papier.
      window.addEventListener('afterprint', () => { boite.hidden = true; }, { once: true });
      window.print();
    },
  };

  window.Postcard = Postcard;
})();

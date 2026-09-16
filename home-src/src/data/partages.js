/* Les supports sur lesquels l'équipe commerciale partage un lien.
 *
 * Chaque support fixe la source et la nature enregistrées dans le lien
 * (utm_source et utm_medium). C'est tout l'intérêt de la page /lien : personne
 * ne tape « Instagram », « instagram » ou « insta » à la main, sinon le même
 * canal se retrouve compté en trois fois dans PostHog.
 *
 * Un support qui manque se saisit à la main sur la page (choix « Autre »), ce
 * qui évite d'avoir à modifier ce fichier pour un cas isolé. */

export const SUPPORTS = [
  {
    key: 'linkedin-post',
    label: 'LinkedIn, une publication',
    icon: 'Linkedin',
    source: 'linkedin',
    medium: 'social',
    aide: 'La publication que vous écrivez depuis votre compte ou depuis la page Open Projets.',
  },
  {
    key: 'linkedin-message',
    label: 'LinkedIn, un message',
    icon: 'Send',
    source: 'linkedin',
    medium: 'message',
    aide: "Un message envoyé à une personne précise, dans sa messagerie LinkedIn.",
  },
  {
    key: 'email-prospection',
    label: 'Un e-mail de prospection',
    icon: 'Mail',
    source: 'email',
    medium: 'email',
    aide: "L'e-mail que vous envoyez à une collectivité, seul ou en publipostage.",
  },
  {
    key: 'signature',
    label: 'Votre signature de mail',
    icon: 'PenLine',
    source: 'signature',
    medium: 'email',
    aide: 'Le lien posé sous votre nom, dans tous les mails que vous envoyez.',
  },
  {
    key: 'newsletter',
    label: 'Une infolettre',
    icon: 'Newspaper',
    source: 'newsletter',
    medium: 'email',
    aide: "L'envoi régulier à votre liste de contacts.",
  },
  {
    key: 'salon',
    label: 'Un salon ou un rendez-vous',
    icon: 'Users',
    source: 'salon',
    medium: 'terrain',
    aide: "Sur un stand ou en rendez-vous, avec le QR code proposé plus bas.",
  },
  {
    key: 'imprime',
    label: 'Un document imprimé',
    icon: 'Printer',
    source: 'imprime',
    medium: 'print',
    aide: 'Une plaquette, un dossier de presse, un courrier papier.',
  },
  {
    key: 'presentation',
    label: 'Une présentation ou une visio',
    icon: 'Presentation',
    source: 'presentation',
    medium: 'slides',
    aide: "La diapositive que vous montrez à l'écran, ou le lien collé dans la conversation.",
  },
  {
    key: 'instagram',
    label: 'Instagram',
    icon: 'Instagram',
    source: 'instagram',
    medium: 'social',
    aide: 'Le lien de la biographie, une publication ou une story.',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'Facebook',
    source: 'facebook',
    medium: 'social',
    aide: 'Une publication sur votre page ou dans un groupe de collectivités.',
  },
]

/* Les natures proposées quand le support ne figure pas dans la liste.
 * Elles servent à regrouper les canaux dans PostHog : un e-mail reste un
 * e-mail, qu'il parte de votre boîte ou d'un outil d'envoi. */
export const NATURES = [
  { value: 'social', label: 'Un réseau social' },
  { value: 'message', label: 'Un message adressé à une personne' },
  { value: 'email', label: 'Un e-mail' },
  { value: 'print', label: 'Un document imprimé' },
  { value: 'terrain', label: 'Une rencontre sur le terrain' },
  { value: 'referral', label: "Le site d'un partenaire" },
  { value: 'autre', label: 'Autre chose' },
]

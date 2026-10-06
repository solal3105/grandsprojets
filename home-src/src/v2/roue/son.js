/* Le son de la roue, fabriqué par le navigateur (Web Audio) : aucun fichier à
 * charger. Le claquement de la languette sur chaque picot, un souffle au lancer
 * et une petite fanfare quand la roue s'arrête.
 *
 * Le navigateur n'autorise le son qu'après un geste : `reveiller` est appelé au
 * premier contact avec la roue. */

export function creerSon() {
  let ctx = null
  let sortie = null
  let echo = null
  let bruit = null
  let dernierClic = 0
  let actif = true

  function reveiller() {
    if (!ctx) {
      const Contexte = window.AudioContext || window.webkitAudioContext
      if (!Contexte) return
      ctx = new Contexte()
      sortie = ctx.createGain()
      sortie.gain.value = 0.7
      sortie.connect(ctx.destination)
      // Un écho court donne de l'espace à la fanfare.
      echo = ctx.createDelay(1)
      echo.delayTime.value = 0.16
      const retour = ctx.createGain()
      retour.gain.value = 0.28
      const mouille = ctx.createGain()
      mouille.gain.value = 0.22
      echo.connect(retour)
      retour.connect(echo)
      echo.connect(mouille)
      mouille.connect(sortie)
      bruit = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.4), ctx.sampleRate)
      const donnees = bruit.getChannelData(0)
      for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  }

  const pret = () => actif && ctx && ctx.state === 'running'

  function enveloppe(gain, debut, volume, attaque, chute) {
    gain.gain.setValueAtTime(0.0001, debut)
    gain.gain.exponentialRampToValueAtTime(volume, debut + attaque)
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + attaque + chute)
  }

  /* Le claquement : un bruit bref filtré, pour le plastique de la languette, et
   * une note sourde, pour le bois du picot. Plus la roue va vite, plus il est
   * discret, sinon la rafale devient un bourdonnement. */
  function clic(vitesse) {
    if (!pret()) return
    const t = ctx.currentTime
    if (t - dernierClic < 0.022) return
    dernierClic = t
    const volume = Math.min(1, Math.max(0.22, 1.35 - vitesse / 12))

    const source = ctx.createBufferSource()
    source.buffer = bruit
    const filtre = ctx.createBiquadFilter()
    filtre.type = 'bandpass'
    filtre.frequency.value = 2600 + Math.random() * 900
    filtre.Q.value = 1.4
    const g1 = ctx.createGain()
    enveloppe(g1, t, 0.55 * volume, 0.001, 0.035)
    source.connect(filtre)
    filtre.connect(g1)
    g1.connect(sortie)
    source.start(t, Math.random() * 0.3, 0.05)

    const note = ctx.createOscillator()
    note.type = 'triangle'
    note.frequency.setValueAtTime(820 + Math.random() * 60, t)
    note.frequency.exponentialRampToValueAtTime(420, t + 0.05)
    const g2 = ctx.createGain()
    enveloppe(g2, t, 0.32 * volume, 0.001, 0.06)
    note.connect(g2)
    g2.connect(sortie)
    note.start(t)
    note.stop(t + 0.08)
  }

  /* Le souffle du lancer : un bruit qui s'ouvre puis se referme. */
  function elan(force) {
    if (!pret()) return
    const t = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = bruit
    source.loop = true
    const filtre = ctx.createBiquadFilter()
    filtre.type = 'lowpass'
    filtre.frequency.setValueAtTime(300, t)
    filtre.frequency.exponentialRampToValueAtTime(1800 + force * 60, t + 0.18)
    filtre.frequency.exponentialRampToValueAtTime(250, t + 0.6)
    const g = ctx.createGain()
    enveloppe(g, t, 0.35, 0.05, 0.55)
    source.connect(filtre)
    filtre.connect(g)
    g.connect(sortie)
    source.start(t)
    source.stop(t + 0.7)
  }

  function note(frequence, debut, duree, volume, forme = 'triangle') {
    const o = ctx.createOscillator()
    o.type = forme
    o.frequency.value = frequence
    const g = ctx.createGain()
    enveloppe(g, debut, volume, 0.012, duree)
    o.connect(g)
    g.connect(sortie)
    g.connect(echo)
    o.start(debut)
    o.stop(debut + duree + 0.05)
  }

  /* La fanfare : un arpège qui monte, un accord qui sonne, et quelques
   * scintillements aigus pendant que les confettis retombent. */
  function fanfare() {
    if (!pret()) return
    const t = ctx.currentTime + 0.02
    const arpege = [523.25, 659.25, 783.99, 1046.5]
    arpege.forEach((f, i) => {
      note(f, t + i * 0.085, 0.2, 0.22)
      note(f * 2, t + i * 0.085, 0.12, 0.05, 'square')
    })
    const accord = t + arpege.length * 0.085
    ;[1046.5, 1318.5, 1568].forEach((f) => note(f, accord, 1.3, 0.16))
    note(261.63, accord, 1.2, 0.14, 'sine')
    for (let i = 0; i < 9; i++) {
      note(2200 + Math.random() * 2400, accord + 0.15 + Math.random() * 1.1, 0.12, 0.05, 'sine')
    }
  }

  return {
    reveiller,
    clic,
    elan,
    fanfare,
    get actif() { return actif },
    set actif(v) { actif = v },
  }
}

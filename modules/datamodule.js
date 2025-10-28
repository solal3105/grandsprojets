// Module de gestion des données et de l'interface utilisateur

// Cache ultra-simple en mémoire
const simpleCache = {
	_cache: {},
	_hits: 0,
	_misses: 0,
	_ttl: 600000, // Durée de vie des entrées : 10 minutes

	// Récupère ou met en cache le résultat d'une fonction asynchrone
	async get(key, fetchFn) {
		// Tentative de récupération depuis le cache
		if (key in this._cache) {
			const entry = this._cache[key];

			// Gestion d’expiration (TTL)
			if (entry && Date.now() - entry.timestamp < this._ttl) {
				this._hits++;
				return entry.value ?? entry.promise; // value si déjà résolu, sinon promesse en cours
			}
			// Entrée expirée ➜ suppression
			delete this._cache[key];
		}

		// Pas en cache ou expiré ➜ appel réseau (miss)
		this._misses++;

		// Lancer immédiatement l’appel réseau et stocker la promesse pour mutualiser les requêtes concurrentes
		const fetchPromise = (async () => {
			try {
				const data = await fetchFn();
				// Remplacer la promesse par la valeur finale + horodatage
				this._cache[key] = {
					value: data,
					timestamp: Date.now()
				};
				return data;
			} catch (error) {
				// Nettoyer l’entrée pour éviter de bloquer sur une erreur
				delete this._cache[key];
				throw error;
			}
		})();

		// Stockage de la promesse avant sa résolution
		this._cache[key] = {
			promise: fetchPromise,
			timestamp: Date.now()
		};
		return fetchPromise;
	},

	// Pour vider tout le cache
	clear() {
		const count = Object.keys(this._cache).length;
		this._cache = {};
		this._hits = 0;
		this._misses = 0;
		return count;
	},

	// Méthode de débogage désactivée en production
	debug() {
		// Fonctionnalité de débogage désactivée
		return {
			size: Object.keys(this._cache).length,
			hits: this._hits,
			misses: this._misses,
			keys: []
		};
	}
};

// Exposer pour le débogage
// window.debugCache = simpleCache;

window.DataModule = (function() {
	// Variables internes pour stocker les configurations
	let urlMap = {};
	let styleMap = {};
	let defaultLayers = [];
	let layerData = {};


	// Exposer une méthode d'initialisation
	function initConfig({
		urlMap: u,
		styleMap: s,
		defaultLayers: d
	}) {
		// Initialisation silencieuse en production
		urlMap = u || {};
		styleMap = s || {};
		defaultLayers = d || [];

		// Vérification silencieuse en production
	}

	// --- Génération de contenu pour le tooltip ---

	// Génère le contenu du popup (carte ou cover)
	async function generateTooltipContent(feature, layerName, variant = 'card') {
		const props = feature?.properties || {};

		// Les données sont maintenant directement dans les properties depuis fetchLayerData
		let imgUrl = props.cover_url || props.imgUrl;
		let title = props.project_name || props.name || props.Name || props.line || '';

		// Ajustement du titre pour Voie Lyonnaise
		if (layerName === 'velo' && props.project_name && !title.startsWith('Voie Lyonnaise')) {
			title = `Voie Lyonnaise ${props.project_name}`;
		}

		// Simple échappement pour éviter l'injection HTML
		const esc = (s) => String(s || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\"/g, '&quot;')
			.replace(/'/g, '&#39;');

		const titleHtml = esc(title);

		// Si aucune donnée exploitable, ne rien afficher
		if (!titleHtml && !imgUrl) return '';

		// Variante "cover" (utilisée pour les marqueurs caméra)
		if (variant === 'cover' && imgUrl) {
			return `
          <div class="project-cover-wrap project-cover-wrap--popup">
            <img class="project-cover" src="${esc(imgUrl)}" alt="${titleHtml || 'Illustration'}">
            ${titleHtml ? `<div class="gp-card-title" style="margin-top:8px">${titleHtml}</div>` : ''}
          </div>
        `;
		}

		const imgHtml = imgUrl ?
			`<div class=\"gp-card-media\"><img src=\"${esc(imgUrl)}\" alt=\"${titleHtml || 'Illustration'}\"/></div>` :
			`<div class=\"gp-card-media gp-card-media--placeholder\"></div>`;

		// Afficher un petit CTA uniquement pour les couches cliquables (catégories dynamiques)
		const clickableLayers = (typeof window.getAllCategories === 'function') ?
			window.getAllCategories() :
			[];
		const showCta = clickableLayers.includes(layerName);

		return `
        <div class=\"card-tooltip\">
          ${imgHtml}
          <div class=\"gp-card-body\">
            ${titleHtml ? `<div class=\"gp-card-title\">${titleHtml}</div>` : ''}
            ${showCta ? `
              <div class=\"gp-card-cta\" role=\"note\" aria-hidden=\"true\">
                <i class=\"fa-solid fa-hand-pointer\" aria-hidden=\"true\"></i>
                <span>Cliquez pour en savoir plus</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
	}

	// --- Gestion du style et des événements ---

	// Renvoie le style d'une feature selon la couche et ses propriétés
	function getFeatureStyle(feature, layerName) {
		// Récupérer le style depuis styleMap ou utiliser un fallback
		const baseStyle = styleMap[layerName] || {
			color: 'var(--info)',
			weight: 3,
			opacity: 0.8,
			fill: false,
		};

		// Appliquer les styles personnalisés via le module LayerStyles
		if (window.LayerStyles?.applyCustomLayerStyle) {
			return window.LayerStyles.applyCustomLayerStyle(feature, layerName, baseStyle);
		}

		// Fallback si le module n'est pas chargé
		return baseStyle;
	}

	// Applique un style de manière sécurisée à une couche
	// Fonction utilitaire: parse une couleur CSS en objet RGB
	function parseColorToRgb(color) {
		if (!color) return null;
		const c = String(color).trim();
		// Hex court ou long
		const hexMatch = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
		if (hexMatch) {
			let hex = hexMatch[1];
			if (hex.length === 3) {
				hex = hex.split('').map(ch => ch + ch).join('');
			}
			return {
				r: parseInt(hex.substring(0, 2), 16),
				g: parseInt(hex.substring(2, 4), 16),
				b: parseInt(hex.substring(4, 6), 16)
			};
		}
		// rgb/rgba
		const rgbMatch = c.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i);
		if (rgbMatch) {
			const clamp = (n) => Math.max(0, Math.min(255, parseInt(n, 10)));
			return {
				r: clamp(rgbMatch[1]),
				g: clamp(rgbMatch[2]),
				b: clamp(rgbMatch[3])
			};
		}
		return null; // Format non géré (nom CSS), on abandonne proprement
	}

	// Fonction utilitaire pour assombrir une couleur (hex ou rgb/rgba). Retourne la couleur d'origine si non gérable.
	function darkenColor(color, factor = 0.5) {
		const rgb = parseColorToRgb(color);
		if (!rgb) return color;
		const darkerR = Math.max(0, Math.round(rgb.r * (1 - factor)));
		const darkerG = Math.max(0, Math.round(rgb.g * (1 - factor)));
		const darkerB = Math.max(0, Math.round(rgb.b * (1 - factor)));
		return `#${darkerR.toString(16).padStart(2, '0')}${darkerG.toString(16).padStart(2, '0')}${darkerB.toString(16).padStart(2, '0')}`;
	}

	function safeSetStyle(layer, style) {
		if (layer && typeof layer.setStyle === 'function') {
			layer.setStyle(style);
		} else if (layer && typeof layer.eachLayer === 'function') {
			layer.eachLayer(innerLayer => {
				if (typeof innerLayer.setStyle === 'function') {
					innerLayer.setStyle(style);
				}
			});
		}
	}

	// Ferme proprement le tooltip de survol projet s'il existe
	function closeHoverTooltip() {
		try {
			if (window.__gpHoverTooltip && MapModule?.map) {
				MapModule.map.removeLayer(window.__gpHoverTooltip);
			}
		} catch (e) {
			/* noop */ }
		window.__gpHoverTooltip = null;
	}


	// Lie les événements (tooltip, mouseover, click, etc.) à une feature
	function bindFeatureEvents(layer, feature, geojsonLayer, layerName) {
		// Détecter si c'est un point avec image (camera marker)
		const isPoint = /Point$/i.test(feature?.geometry?.type || '');
		const hasImage = !!(feature?.properties?.imgUrl);
		
		// Si c'est un camera marker, déléguer à CameraMarkers
		if (isPoint && hasImage && window.CameraMarkers?.bindCameraMarkerEvents) {
			window.CameraMarkers.bindCameraMarkerEvents(feature, layer);
			return;
		}

		// Tooltip hover compact pour les couches Travaux (centralisé via LayerRegistry)
		if (window.LayerRegistry?.isTravauxLayer && window.LayerRegistry.isTravauxLayer(layerName)) {
			const props = feature.properties || {};
			const name = props.name || props.nature_travaux || 'Chantier';
			
			// Calcul avancement
			const safeDate = (v) => {
				const d = v ? new Date(v) : null;
				return d && !isNaN(d.getTime()) ? d : null;
			};
			const debut = safeDate(props.date_debut);
			const fin = safeDate(props.date_fin);
			const now = new Date();
			const progressPct = (() => {
				if (!(debut && fin) || fin <= debut) return 0;
				const total = fin - debut;
				const elapsed = now - debut;
				return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
			})();
			
			// Gradient correct: 0% danger -> 50% warning -> 100% success
			let gradientBg;
			if (progressPct <= 50) {
				// 0-50%: danger vers warning
				const pct = (progressPct / 50) * 100;
				gradientBg = `linear-gradient(90deg, var(--danger) 0%, var(--danger) ${100-pct}%, var(--warning) 100%)`;
			} else {
				// 50-100%: warning vers success
				const pct = ((progressPct - 50) / 50) * 100;
				gradientBg = `linear-gradient(90deg, var(--warning) 0%, var(--warning) ${100-pct}%, var(--success) 100%)`;
			}
			
			// Tooltip compact au survol
			const tooltipHTML = `
				<div class="travaux-tooltip-compact">
					<div class="tooltip-name">${name}</div>
					<div class="tooltip-progress">
						<div class="progress-bar">
							<div class="progress-fill" style="width: ${progressPct}%; background: ${gradientBg};"></div>
						</div>
						<span class="progress-text">${progressPct}%</span>
					</div>
				</div>
			`;
			
			layer.bindTooltip(tooltipHTML, {
				className: 'travaux-hover-tooltip',
				direction: 'top',
				offset: [0, -10],
				opacity: 1,
				sticky: true
			});
		}
		
		// Modal détaillée au clic pour les couches Travaux
		if (window.LayerRegistry?.isTravauxLayer && window.LayerRegistry.isTravauxLayer(layerName)) {
			const props = feature.properties || {};
			const safeDate = (v) => {
				const d = v ? new Date(v) : null;
				return d && !isNaN(d.getTime()) ? d : null;
			};
			const debut = safeDate(props.date_debut);
			const fin = safeDate(props.date_fin);
			const now = new Date();
			const dateFmt = (d) => d ? d.toLocaleDateString('fr-FR', {
				day: 'numeric',
				month: 'long',
				year: 'numeric'
			}) : '-';
			const durationDays = (debut && fin && fin > debut) ? Math.max(1, Math.round((fin - debut) / 86400000)) : null;
			const progressPct = (() => {
				if (!(debut && fin) || fin <= debut) return 0;
				const total = fin - debut;
				const elapsed = now - debut;
				return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
			})();
			// Gradient correct: 0% danger -> 50% warning -> 100% success
			let gradientBg;
			let todayColor;
			if (progressPct <= 50) {
				// 0-50%: danger vers warning
				const pct = (progressPct / 50) * 100;
				gradientBg = `linear-gradient(90deg, var(--danger) 0%, var(--danger) ${100-pct}%, var(--warning) 100%)`;
				todayColor = pct < 50 ? 'var(--danger)' : 'var(--warning)';
			} else {
				// 50-100%: warning vers success
				const pct = ((progressPct - 50) / 50) * 100;
				gradientBg = `linear-gradient(90deg, var(--warning) 0%, var(--warning) ${100-pct}%, var(--success) 100%)`;
				todayColor = pct < 50 ? 'var(--warning)' : 'var(--success)';
			}
			const todayPct = (() => {
				if (!(debut && fin) || fin <= debut) return 0;
				const total = fin - debut;
				return Math.max(0, Math.min(100, ((now - debut) / total) * 100));
			})();
			const commune = props.commune || props.ville || props.COMMUNE || '';
			const titre = props.nature_travaux || 'Chantier';
			const etat = props.etat || '—';
			const etatClass = (() => {
				const e = (etat || '').toLowerCase();
				if (e.includes('ouver')) return 'etat--ouvert';
				if (e.includes('prochain')) return 'etat--prochain';
				if (e.includes('termin')) return 'etat--termine';
				return 'etat--neutre';
			})();
			const adrs = (props.adresse || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

			// HTML bento structure
			const tooltipContent = `
          <div class="gp-travaux glass">
            <div class="gp-hero">
              <div class="hero-left">
                <span class="hero-icon">🚧</span>
                <div>
                  <div class="hero-title">${titre || 'Travaux'}</div>
                  <div class="hero-sub">${commune || ''}</div>
                </div>
              </div>
              <span class="etat-pill ${etatClass}">${etat}</span>
            </div>
  
            <div class="gp-bento">
              <section class="tile tile--etat tile--timeline span-2">
                <h3>Avancement</h3>
                <div class="timeline">
                  <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}" aria-label="Avancement des travaux">
                    <div class="fill" data-target="${progressPct}" style="width:0%; background:${gradientBg}; box-shadow: 0 0 10px ${progressPct>=100 ? 'var(--success-alpha-25)' : 'var(--warning-alpha-25)'}"></div>
                    <div class="today" style="left:${todayPct}%; background:${todayColor}; box-shadow: 0 0 0 3px ${progressPct>=100 ? 'var(--success-alpha-25)' : 'var(--warning-alpha-25)'}, 0 0 10px ${progressPct>=100 ? 'var(--success-alpha-4)' : 'var(--warning-alpha-4)'};"></div>
                  </div>
                  <div class="dates">
                    <span>${debut ? dateFmt(debut) : '-'}</span>
                    <span>${fin ? dateFmt(fin) : '-'}</span>
                  </div>
                  <div class="meta">
                    <span>${durationDays ? `${durationDays} jours` : ''}</span>
                    <span>${progressPct}%</span>
                  </div>
                </div>
              </section>
  
              <section class="tile">
                <h3>Natures</h3>
                <div class="badges">
                  ${props.nature_chantier ? `<span class="badge">${props.nature_chantier}</span>` : ''}
                  ${props.nature_travaux ? `<span class="badge">${props.nature_travaux}</span>` : ''}
                </div>
              </section>
  
              <section class="tile">
                <h3>Adresses</h3>
                <ul class="addresses ${adrs.length > 5 ? 'collapsed' : ''}">
                  ${adrs.map((a)=>`<li><span>${a}</span></li>`).join('')}
                </ul>
                <div class="tile-actions">
                  ${adrs.length>5 ? '<button class="toggle-addresses">Voir plus</button>' : ''}
                </div>
              </section>
            </div>
          </div>
        `;

			// Ouvrir un modal avec ModalHelper unifié
			const openTravauxModal = async (htmlContent, featureProps) => {
				try {
					// Récupérer la modale existante
					const modalContent = document.getElementById('travaux-modal-content');
					if (!modalContent) {
						console.error('[DataModule] travaux-modal-content not found');
						return;
					}
					
					// Vérifier si l'utilisateur est admin et si le chantier est éditable
					const activeCity = (typeof window.getActiveCity === 'function') ? window.getActiveCity() : window.activeCity;
					const isEditableSource = activeCity && activeCity !== 'default';
					
					let isAdmin = false;
					if (isEditableSource && window.supabaseService) {
						try {
							const session = await window.supabaseService.getClient()?.auth.getSession();
							if (session?.data?.session?.user) {
								const role = window.__CONTRIB_ROLE || '';
								const userVilles = window.__CONTRIB_VILLES || [];
								isAdmin = role === 'admin' && (userVilles.includes('global') || userVilles.includes(activeCity));
							}
						} catch (err) {
							console.warn('[DataModule] Erreur vérification admin:', err);
						}
					}
					
					// Injecter le contenu
					modalContent.innerHTML = htmlContent;
					
					// Ouvrir la modale avec ModalHelper
					window.ModalHelper.open('travaux-overlay', {
						dismissible: true,
						lockScroll: true,
						focusTrap: true,
						onOpen: () => {
							// Initialisations spécifiques Bento après ouverture
							const modalEl = modalContent.querySelector('.gp-travaux');
							if (modalEl) {
								// Progress bar animation
								const fill = modalEl.querySelector('.timeline .fill');
								const target = Number(fill?.getAttribute('data-target') || 0);
								if (fill && !isNaN(target)) {
									requestAnimationFrame(() => {
										fill.style.width = '0%';
										setTimeout(() => {
											fill.style.width = `${target}%`;
										}, 40);
									});
								}

								// Addresses toggle/copy
								const ul = modalEl.querySelector('.addresses');
								const toggleBtn = modalEl.querySelector('.toggle-addresses');
								if (toggleBtn) {
									toggleBtn.addEventListener('click', () => {
										ul?.classList.toggle('collapsed');
										if (toggleBtn.textContent.includes('plus')) {
											toggleBtn.textContent = 'Voir moins';
										} else {
											toggleBtn.textContent = 'Voir plus';
										}
									});
								}
								
								// Ajouter les boutons d'édition/suppression pour les admins
								if (isAdmin && featureProps?.chantier_id) {
									const actionsContainer = document.createElement('div');
									actionsContainer.className = 'gp-modal-actions';
									actionsContainer.style.cssText = 'display: flex; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-light);';
									
									const editBtn = document.createElement('button');
									editBtn.className = 'btn-primary';
									editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Modifier';
									editBtn.onclick = () => {
										window.ModalHelper.close('travaux-overlay');
										if (window.TravauxEditorModule?.openEditorForEdit) {
											window.TravauxEditorModule.openEditorForEdit(featureProps.chantier_id);
										} else {
											console.warn('[DataModule] TravauxEditorModule.openEditorForEdit non disponible');
										}
									};
									
									const deleteBtn = document.createElement('button');
									deleteBtn.className = 'btn-danger';
									deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Supprimer';
									deleteBtn.onclick = async () => {
										if (!confirm('Êtes-vous sûr de vouloir supprimer ce chantier ? Cette action est irréversible.')) {
											return;
										}
										
										deleteBtn.disabled = true;
										deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Suppression...';
										
										try {
											await window.supabaseService.deleteCityTravaux(featureProps.chantier_id);
											window.ModalHelper.close('travaux-overlay');
											
											// Recharger la couche city-travaux-chantiers
											if (window.DataModule?.reloadLayer) {
												await window.DataModule.reloadLayer('city-travaux-chantiers');
											}
											
											if (window.ContribUtils?.showToast) {
												window.ContribUtils.showToast('Chantier supprimé avec succès', 'success');
											}
										} catch (err) {
											console.error('[DataModule] Erreur suppression:', err);
											if (window.ContribUtils?.showToast) {
												window.ContribUtils.showToast('Erreur lors de la suppression du chantier', 'error');
											}
											deleteBtn.disabled = false;
											deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Supprimer';
										}
									};
									
									actionsContainer.appendChild(editBtn);
									actionsContainer.appendChild(deleteBtn);
									modalEl.appendChild(actionsContainer);
								}
							}
						},
						onClose: () => {
							// Nettoyer le contenu après fermeture
							modalContent.innerHTML = '';
						}
					});
				} catch (e) {
					console.error('[Travaux] Error opening modal:', e);
				}
			};

			// Clic sur la feature: ouvrir le modal et marquer l'événement comme géré
			layer.on('click', (evt) => {
				try {
					if (evt && evt.originalEvent) {
						evt.originalEvent.__gpHandledTravaux = true;
					}
				} catch (_) {}
				openTravauxModal(tooltipContent, props);
			});
		}

		const isFiltered = Object.keys(FilterModule.get(layerName)).length > 0;
		// Récupérer dynamiquement toutes les catégories de contributions
		const detailSupportedLayers = (typeof window.getAllCategories === 'function') ? 
			window.getAllCategories() : 
			[];
		const noInteractLayers = ['planVelo', 'amenagementCyclable'];

		// Tooltip générique (ou spécifique) pour les couches non cliquables (paths/polygones)
		try {
			if (!(window.LayerRegistry?.isTravauxLayer && window.LayerRegistry.isTravauxLayer(layerName)) && typeof layer.bindTooltip === 'function') {
				const p = (feature && feature.properties) || {};
				const geomType = (feature && feature.geometry && feature.geometry.type) || '';
				const isPathOrPoly = /LineString|Polygon/i.test(geomType);
				const projectNameGuess = p?.project_name || p?.name || p?.line || p?.Name || p?.LIBELLE;
				const isDetailSupported = detailSupportedLayers.includes(layerName);
				const isClickable = isDetailSupported && !!projectNameGuess;
				if (!isClickable && isPathOrPoly) {
					const esc = (s) => String(s || '')
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;')
						.replace(/\"/g, '&quot;')
						.replace(/'/g, '&#39;');
					const title = projectNameGuess || p?.titre || p?.title || '';
					let inner;

					// Règles spécifiques par couche
					if (layerName === 'bus') {
						const val = p.bus || p.BUS || p.Bus || '';
						inner = `<div class="gp-tt-body">${esc(`bus ${val}`)}</div>`;
					} else if (layerName === 'metroFuniculaire') {
						const ligne = p.ligne || p.LIGNE || p.Line || '';
						const isFuni = String(ligne).toUpperCase() === 'F1' || String(ligne).toUpperCase() === 'F2';
						const label = isFuni ? `Funiculaire ${ligne}` : `Métro ${ligne}`;
						inner = `<div class="gp-tt-body">${esc(label)}</div>`;
					} else if (layerName === 'tramway') {
						const val = p.tramway || p.ligne || p.LIGNE || '';
						inner = `<div class="gp-tt-body">${esc(`Tramway ${val}`)}</div>`;
					} else if (layerName === 'emplacementReserve' || /plu|emplacement|reserve/i.test(layerName)) {
						const raw = (p.type ?? p.TYPE ?? p.Type ?? p.libelle ?? p.LIBELLE ?? p.code ?? p.CODE ?? p.typologie ?? '').toString().trim();
						const normalizeKey = (s) => s
							.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
							.toUpperCase()
							.replace(/[^A-Z]/g, ''); // remove spaces, dashes, underscores, etc.
						const key = normalizeKey(raw);
						const map = {
							// Primary codes
							'ELARVOIE': 'Élargissement de voirie',
							'CREAVOIE': 'Création de voirie',
							'CARREF': 'Aménagement de carrefour',
							'EQUIPUBL': 'Équipements publics',
							'MAILPLANTE': 'Mail planté / espace vert',
							// Common variations/synonyms (defensive)
							'ELARGVOIE': 'Élargissement de voirie',
						};
						const label = map[key] || raw || '';
						inner = `<div class="gp-tt-body">${esc(`Objectif : ${label}`)}</div>`;
					} else {
						// Fallback générique : afficher seulement le titre
						inner = title ? `<div class="gp-tt-title">${esc(title)}</div>` : '';
					}
					// Désactiver la tooltip au survol pour certaines couches
					if (layerName !== 'planVelo' && layerName !== 'amenagementCyclable') {
						layer.bindTooltip(inner, {
							className: 'gp-path-tooltip',
							sticky: true,
							direction: 'auto',
							// Les lignes ayant une épaisseur fine, sticky améliore la UX
							// offset est géré automatiquement par Leaflet
						});
					}
				}
			}
		} catch (_) {
			/* noop */ }

		// (clic géré plus bas dans la fonction; ici rien à faire)

		// Helper: stoppe proprement une animation de pointillés et nettoie le style
		function stopDashAnimation(layer) {
			if (layer.__dashInterval) {
				clearInterval(layer.__dashInterval);
				layer.__dashInterval = null;
			}
			// Nettoyer explicitement le dashArray et dashOffset
			if (typeof layer.setStyle === 'function') {
				try {
					const currentOptions = layer.options || {};
					layer.setStyle({
						dashArray: null,
						dashOffset: 0
					});
				} catch (_) {}
			}
		}

		// Helper: démarre une animation de pointillés
		function startDashAnimation(layer) {
			// Toujours stopper l'animation existante avant d'en démarrer une nouvelle
			stopDashAnimation(layer);
			
			let dashOffset = 0;
			layer.__dashInterval = setInterval(() => {
				if (typeof layer.setStyle === 'function') {
					try {
						layer.setStyle({
							dashArray: '10, 10',
							dashOffset: dashOffset
						});
					} catch (_) {
						// Si erreur, stopper l'animation
						stopDashAnimation(layer);
					}
				}
				dashOffset = (dashOffset + 1) % 20;
			}, 100);
		}

		// Ajoute un style de survol si la couche supporte les fiches détails
		if (detailSupportedLayers.includes(layerName)) {
			layer.on('mouseover', function(e) {
				const p = (feature && feature.properties) || {};
				const isContribution = !!(p.project_name && p.category);

				// Réinitialiser tous les styles et stopper toutes les animations
				geojsonLayer.eachLayer(otherLayer => {
					stopDashAnimation(otherLayer);
					const originalStyle = getFeatureStyle(otherLayer.feature, layerName);
					if (typeof otherLayer.setStyle === 'function') {
						otherLayer.setStyle(originalStyle);
					}
				});

				// Animer tous les segments de cette contribution (même project_name)
				if (isContribution) {
					const contributionName = p.project_name;
					geojsonLayer.eachLayer(otherLayer => {
						const op = (otherLayer?.feature?.properties) || {};
						if (op.project_name === contributionName && typeof otherLayer.setStyle === 'function') {
							const originalStyle = getFeatureStyle(otherLayer.feature, layerName);
							otherLayer.setStyle({
								color: darkenColor(originalStyle.color || 'var(--info)', 0.2),
								weight: (originalStyle.weight || 3) + 2,
								dashArray: '10, 10',
								opacity: 1,
								fillOpacity: originalStyle.fillOpacity || 0.2
							});
							startDashAnimation(otherLayer);
						}
					});
				}

				// Afficher un tooltip riche (image + titre) pour le projet lié
				try {
					generateTooltipContent(feature, layerName).then(html => {
						if (html) {
							closeHoverTooltip();
							window.__gpHoverTooltip = L.tooltip({
									className: 'gp-project-tooltip',
									direction: 'top',
									permanent: false,
									offset: [0, -12],
									opacity: 1,
									// Rendre cliquable pour ouvrir la fiche projet (mobile/desktop)
									interactive: true
								}).setLatLng(e.latlng)
								.setContent(html)
								.addTo(MapModule.map);

							// Rendre le tooltip cliquable pour ouvrir la fiche détail
							try {
								const el = window.__gpHoverTooltip && typeof window.__gpHoverTooltip.getElement === 'function' ?
									window.__gpHoverTooltip.getElement() :
									null;
								if (el) {
									el.style.cursor = 'pointer';
									// Assurer l'interactivité même si le CSS met pointer-events: none sur le tooltip
									try { el.style.pointerEvents = 'auto'; } catch (_) {}

									// 1) Clic sur tout le tooltip
									el.addEventListener('click', (ev) => {
										try {
											ev.preventDefault();
											ev.stopPropagation();
										} catch (_) {}
										try {
											// Réutiliser la logique existante du clic sur la couche
											if (layer && typeof layer.fire === 'function') {
												layer.fire('click');
											} else if (window.UIModule && typeof window.UIModule.showDetailPanel === 'function') {
												window.UIModule.showDetailPanel(layerName, feature);
											}
										} catch (_) {
											/* noop */ }
									});

									// 2) Clic ciblé sur la carte de tooltip (nouvelle classe .card-tooltip)
									try {
										const card = el.querySelector('.card-tooltip');
										if (card) {
											card.style.pointerEvents = 'auto';
											card.addEventListener('click', (ev) => {
												try {
													ev.preventDefault();
													ev.stopPropagation();
												} catch (_) {}
												try {
													if (layer && typeof layer.fire === 'function') {
														layer.fire('click');
													} else if (window.UIModule && typeof window.UIModule.showDetailPanel === 'function') {
														window.UIModule.showDetailPanel(layerName, feature);
													}
												} catch (_) {}
											});
										}
									} catch (_) {}
								}
							} catch (_) {
								/* noop */ }

							// Suivre la souris tant que l'on reste sur la même feature
							const moveHandler = (ev) => {
								if (window.__gpHoverTooltip) {
									window.__gpHoverTooltip.setLatLng(ev.latlng);
								}
							};
							layer.__gpMoveHandler = moveHandler;
							layer.on('mousemove', moveHandler);
						}
					}).catch(err => {
						// silencieux en production
					});
				} catch (err) {
					// silencieux en production
				}
			});

			layer.on('mouseout', function(e) {
				// Restaurer les styles originaux et stopper toutes les animations
				geojsonLayer.eachLayer(otherLayer => {
					stopDashAnimation(otherLayer);
					const originalStyle = getFeatureStyle(otherLayer.feature, layerName);
					if (typeof otherLayer.setStyle === 'function') {
						// Restaurer le style original en forçant la suppression du dashArray pour les contributions
						const op = (otherLayer?.feature?.properties) || {};
						const isContrib = !!(op.project_name && op.category);
						if (isContrib) {
							// Pour les contributions, forcer la suppression du dashArray
							otherLayer.setStyle({
								...originalStyle,
								dashArray: null,
								dashOffset: 0
							});
						} else {
							// Pour les autres, restaurer tel quel
							otherLayer.setStyle(originalStyle);
						}
					}
				});

				// Fermer le tooltip et détacher le suivi
				if (layer.__gpMoveHandler) {
					layer.off('mousemove', layer.__gpMoveHandler);
					delete layer.__gpMoveHandler;
				}
				closeHoverTooltip();
			});
		}




		// Gestion du clic sur la feature (contributions de contribution_uploads uniquement)
		if (!noInteractLayers.includes(layerName)) {
			layer.on('click', () => {
				const p = (feature && feature.properties) || {};
				const projectName = p.project_name;
				
				// Vérifier si c'est une contribution de contribution_uploads
				// Ces features ont project_name + category (et souvent markdown_url/cover_url)
				const isContribution = !!(projectName && p.category);

				// Ne traiter que les vraies contributions (pas les chantiers)
				if (!isContribution) {
					return;
				}

			// Nettoyer la carte: retirer toutes les autres couches
			try {
				Object.keys(MapModule.layers || {}).forEach((lname) => {
					if (lname !== layerName) {
						try {
							MapModule.removeLayer(lname);
						} catch (_) {}
					}
				});
			} catch (_) {}

			// Filtrer visuellement: masquer les autres projets
			try {
				const currentLayer = MapModule.layers[layerName];
				if (currentLayer) {
					currentLayer.eachLayer(otherLayer => {
						const op = (otherLayer?.feature?.properties) || {};
						if (op.project_name !== projectName && typeof otherLayer.setStyle === 'function') {
							otherLayer.setStyle({
								opacity: 0,
								fillOpacity: 0
							});
						}
					});
				}
				FilterModule.set(layerName, { project_name: projectName });
			} catch (_) {}

			// Actions post-clic
			try {
				UIModule.showDetailPanel(layerName, feature);
			} catch (_) {}
			try {
				UIModule.updateActiveFilterTagsForLayer(layerName);
			} catch (_) {}

			// Zoomer sur l'étendue du projet filtré
			try {
				const filteredLayer = MapModule.layers[layerName];
				if (filteredLayer && typeof filteredLayer.getBounds === 'function') {
					const bounds = filteredLayer.getBounds();
					if (bounds && bounds.isValid()) {
						MapModule.map.fitBounds(bounds, {
							padding: [50, 50]
						});
					}
				}
			} catch (_) {}
			});
		}
	}




	// Récupère les données d'une couche avec cache
	async function fetchLayerData(layerName) {
		// Clé de cache simple
		const cacheKey = `layer_${layerName}`;

		// Utilisation du cache
		return simpleCache.get(cacheKey, async () => {
			// ===== TRAVAUX: Layer avec source dynamique (URL ou city_travaux) =====
			if (layerName === 'travaux') {
				const activeCity = (typeof window.getActiveCity === 'function') 
					? window.getActiveCity() 
					: (window.activeCity || 'metropole-lyon');
				const config = await window.supabaseService.getTravauxConfig(activeCity);
				
				if (!config) {
					console.warn('[DataModule] Pas de config travaux pour', activeCity);
					return { type: 'FeatureCollection', features: [] };
				}
				
				if (config.source_type === 'url' && config.url) {
					// Charger depuis URL externe
					try {
						const response = await fetch(config.url);
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const data = await response.json();
						return data;
					} catch (error) {
						console.error('[DataModule] ❌ Erreur chargement travaux URL:', error);
						return { type: 'FeatureCollection', features: [] };
					}
				} else if (config.source_type === 'city_travaux') {
					// Charger depuis city_travaux
					const cityTravauxData = await window.supabaseService.loadCityTravauxGeoJSON(activeCity);
					return cityTravauxData || { type: 'FeatureCollection', features: [] };
				}
				
				return { type: 'FeatureCollection', features: [] };
			}
			// ===== FIN TRAVAUX =====
			
			// Vérifier si c'est une couche de contributions (stockée temporairement)
			const contributionProjects = window[`contributions_${layerName}`];

			if (contributionProjects && Array.isArray(contributionProjects)) {
				// Construire un FeatureCollection depuis contribution_uploads
				const features = [];

				for (const project of contributionProjects) {
					if (project.geojson_url) {
						try {
							const geoResponse = await fetch(project.geojson_url);
							if (geoResponse.ok) {
								const geoData = await geoResponse.json();

								// Traiter selon le type de GeoJSON
								if (geoData.type === 'FeatureCollection' && geoData.features) {
									// Enrichir chaque feature avec les métadonnées du projet
									geoData.features.forEach(feature => {
										if (!feature.properties) feature.properties = {};
										// Injecter les métadonnées directement dans les properties
										feature.properties.project_name = project.project_name;
										feature.properties.category = project.category;
										feature.properties.cover_url = project.cover_url;
										feature.properties.description = project.description;
										feature.properties.markdown_url = project.markdown_url;
										// NE PAS écraser imgUrl s'il existe déjà dans le GeoJSON
										// (imgUrl est spécifique à chaque feature, cover_url est pour le projet)
									});
									features.push(...geoData.features);
								} else if (geoData.type === 'Feature') {
									// Feature unique
									if (!geoData.properties) geoData.properties = {};
									geoData.properties.project_name = project.project_name;
									geoData.properties.category = project.category;
									geoData.properties.cover_url = project.cover_url;
									geoData.properties.description = project.description;
									geoData.properties.markdown_url = project.markdown_url;
									// NE PAS écraser imgUrl s'il existe déjà dans le GeoJSON
									features.push(geoData);
								}
							}
						} catch (error) {
							console.warn(`[DataModule] Erreur chargement GeoJSON pour ${project.project_name}:`, error);
						}
					}
				}

				// NE PAS supprimer la variable pour permettre le rechargement
				// La variable window[`contributions_${layerName}`] reste disponible

				return {
					type: 'FeatureCollection',
					features: features
				};
			}
			
			// Charger depuis urlMap (layers configurés dans la base de données)
			const url = urlMap[layerName];
			if (url) {
				try {
					const response = await fetch(url);
					if (!response.ok) {
						throw new Error(`HTTP ${response.status}: ${response.statusText}`);
					}
					const data = await response.json();
					return data;
				} catch (error) {
					console.error(`[DataModule] ❌ Erreur chargement layer "${layerName}":`, error);
					return { type: 'FeatureCollection', features: [] };
				}
			}
			
			// Si on arrive ici, le layer n'a ni URL ni données
			console.warn(`[DataModule] ⚠️ Layer inconnu sans URL ni données: ${layerName}`);
			return { type: 'FeatureCollection', features: [] };
		});
	}


	// --- Création et ajout des couches GeoJSON ---

	// Crée la couche GeoJSON et l'ajoute à la carte
	function createGeoJsonLayer(layerName, data) {
		// Normaliser les données d'entrée pour éviter les erreurs Leaflet (addData(undefined))
		let normalized = data;
		try {
			if (!normalized || typeof normalized !== 'object') {
				normalized = { type: 'FeatureCollection', features: [] };
			} else if (Array.isArray(normalized)) {
				normalized = { type: 'FeatureCollection', features: normalized };
			} else if (normalized.type === 'Feature') {
				normalized = { type: 'FeatureCollection', features: [normalized] };
			} else if (normalized.type === 'FeatureCollection' && !Array.isArray(normalized.features)) {
				normalized.features = [];
			}
		} catch (_) {
			normalized = { type: 'FeatureCollection', features: [] };
		}
		data = normalized;
		const criteria = FilterModule.get(layerName);

		// Définir les couches cliquables (catégories dynamiques)
		const clickableLayers = (typeof window.getAllCategories === 'function') ?
			window.getAllCategories() :
			[];
		const isClickable = clickableLayers.includes(layerName);

		// Créer un panneau personnalisé pour les couches cliquables
		if (isClickable) {
			if (!window.clickableLayersPane) {
				window.clickableLayersPane = MapModule.map.createPane('clickableLayers');
				window.clickableLayersPane.style.zIndex = 650; // Au-dessus des tuiles mais en dessous des popups
			}
		}

		// Fonction utilitaire pour vérifier si un texte contient des mots-clés de réseaux
		const isReseau = (text) => {
			if (!text) return false;
			const reseauxKeywords = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'electricite', 'assainissement'];
			return reseauxKeywords.some(keyword =>
				String(text).toLowerCase().includes(keyword.toLowerCase())
			);
		};

		const geojsonLayer = L.geoJSON(null, {
			pane: isClickable ? 'clickableLayers' : 'overlayPane', // Utiliser le panneau personnalisé pour les couches cliquables
			filter: feature => {
				const props = (feature && feature.properties) || {};
				// Détection de page: sur l'index on masque les Points SAUF ceux avec images (camera markers)
				// sur les fiches (/fiche/) on conserve les Points de contribution.
				try {
					const path = (location && location.pathname) ? location.pathname : '';
					const isFichePage = path.includes('/fiche/');
					if (!isFichePage) {
						// Index: masquer les Points SAUF ceux avec imgUrl (camera markers)
						if (feature && feature.geometry && feature.geometry.type === 'Point') {
							const hasImage = !!props.imgUrl;
							return hasImage; // Garder uniquement les points avec images
						}
					} else {
						// Fiche: ne masquer que les Points legacy (sans project_name)
						if (feature && feature.geometry && feature.geometry.type === 'Point') {
							const isContribution = !!props.project_name;
							if (!isContribution) return false;
						}
					}
				} catch (_) {
					/* noop */ }
				// 1. Vérifier les critères de filtrage standards
				const standardCriteriaMatch = Object.entries(criteria)
					.filter(([key]) => !key.startsWith('_')) // Exclure les critères spéciaux (commençant par _)
					.every(([key, value]) =>
						("" + (props[key] || "")).toLowerCase() === String(value).toLowerCase()
					);

				// 2. Vérifier le filtre des réseaux si activé
				const hideReseaux = criteria._hideReseaux === true;
				if (hideReseaux) {
					const isFeatureReseau = isReseau(props.nature_travaux) || isReseau(props.nature_chantier);
					return standardCriteriaMatch && !isFeatureReseau;
				}

				return standardCriteriaMatch;
			},
			style: feature => getFeatureStyle(feature, layerName),
			pointToLayer: (feature, latlng) => {
				// Camera markers avec images
				const hasImage = !!(feature?.properties?.imgUrl);
				if (hasImage && window.CameraMarkers?.createCameraMarker) {
					// Récupérer la couleur de la couche
					const featureStyle = getFeatureStyle(feature, layerName);
					const color = featureStyle?.color || null;
					
					return window.CameraMarkers.createCameraMarker(
						latlng, 
						MapModule?.cameraPaneName || 'markerPane',
						color
					);
				}
				
				// Markers pour les chantiers (centralisé via LayerRegistry)
				if (window.LayerRegistry?.isTravauxLayer && window.LayerRegistry.isTravauxLayer(layerName)) {
					const customMarkerIcon = L.divIcon({
						className: 'travaux-marker',
						iconSize: [32, 40],
						iconAnchor: [16, 40],
						popupAnchor: [0, -40]
					});
					return L.marker(latlng, { icon: customMarkerIcon });
				}
				
				// Pas de marker pour les autres points
				return null;
			},
			onEachFeature: (feature, layer) => {
				bindFeatureEvents(layer, feature, geojsonLayer, layerName);
				
				// Enregistrer les camera markers pour la gestion du zoom
				const isPoint = /Point$/i.test(feature?.geometry?.type || '');
				const hasImage = !!(feature?.properties?.imgUrl);
				if (isPoint && hasImage && layer instanceof L.Marker && window.CameraMarkers?.registerCameraMarker) {
					window.CameraMarkers.registerCameraMarker(layer, geojsonLayer);
				}

				// Add an invisible wide "hitline" above the visible path for easier interactions on lines
				try {
					const g = feature && feature.geometry;
					const t = g && g.type;
					const isLine = t === 'LineString' || t === 'MultiLineString';
					// Create hitline only for clickable layers (those that open a project sheet)
					if (isLine && isClickable && MapModule?.hitRenderer && MapModule?.hitPaneName) {
						const hit = L.geoJSON(feature, {
							renderer: MapModule.hitRenderer,
							pane: MapModule.hitPaneName,
							interactive: true,
							bubblingMouseEvents: false,
							style: {
								// Invisible mais interactif (large zone de clic)
								color: 'var(--black)',
								opacity: 0.001,
								weight: 24,
								lineCap: 'round',
								lineJoin: 'round'
							}
						});
						// Add directly to map to ensure it renders in its pane regardless of parent layer
						hit.addTo(MapModule.map);

						// Forward pointer events from each hit sublayer to the original visible layer
						const forward = (eventName) => {
							hit.eachLayer(h => {
								h.on(eventName, (e) => {
									try {
										if (e && e.originalEvent) {
											e.originalEvent.preventDefault?.();
											e.originalEvent.stopPropagation?.();
										}
										layer.fire(eventName, {
											latlng: e.latlng,
											layerPoint: e.layerPoint,
											containerPoint: e.containerPoint,
											originalEvent: e.originalEvent,
											target: layer,
											propagatedFrom: 'hitline'
										});
									} catch (_) {
										/* noop */ }
								});
							});
						};
						// Rétablit l'animation au survol en relayant aussi hover/move
						['click', 'touchstart', 'mouseover', 'mouseout', 'mousemove'].forEach(forward);

						// Keep lifecycle in sync: remove hitline when original layer is removed
						layer.on('remove', () => {
							try {
								MapModule.map.removeLayer(hit);
							} catch (_) {
								/* noop */ }
						});
					}
				} catch (_) {
					/* noop */ }
			}
		});

		geojsonLayer.addData(data);
		geojsonLayer.addTo(MapModule.map);
		MapModule.addLayer(layerName, geojsonLayer);

		// Surcharge du style après filtrage pour toutes les features visibles
		if (criteria && Object.keys(criteria).length > 0) {
			geojsonLayer.eachLayer(f => {
				if (typeof f.setStyle === 'function') {
					f.setStyle({
						weight: 4
					});
				}
			});
		}
	}

	// --- Fonctions publiques de chargement et préchargement des couches ---

	// Charge une couche (depuis le cache ou le réseau) et l'ajoute à la carte
	function loadLayer(layerName) {
		return fetchLayerData(layerName)
			.then(finalData => {
				// Mise à jour des données en mémoire
				layerData[layerName] = finalData;

				// Suppression de l'ancienne couche si elle existe
				MapModule.removeLayer(layerName);

				// Création de la nouvelle couche
				createGeoJsonLayer(layerName, finalData);
				return finalData;
			})
			.catch(err => {
				throw err; // Propager l'erreur
			});
	}

	// Préccharge les données d'une couche sans l'ajouter à la carte
	function preloadLayer(layerName) {
		return fetchLayerData(layerName)
			.then(data => {
				layerData[layerName] = data; // Mise en mémoire
				return data;
			})
			.catch(err => {
				throw err; // Propager l'erreur
			});
	}

	// Recharge une couche (vide le cache et recharge)
	async function reloadLayer(layerName) {
		try {
			// Vider le cache pour cette couche
			clearLayerCache(layerName);
			
			// Retirer la couche de la carte si elle existe
			if (MapModule?.removeLayer) {
				MapModule.removeLayer(layerName);
			}
			
			// Recharger la couche
			await loadLayer(layerName);
		} catch (err) {
			console.error(`[DataModule] Erreur rechargement couche "${layerName}":`, err);
			throw err;
		}
	}

	// Vide le cache d'un layer spécifique pour forcer son rechargement
	function clearLayerCache(layerName) {
		const cacheKey = `layer_${layerName}`;
		if (simpleCache._cache[cacheKey]) {
			delete simpleCache._cache[cacheKey];
		}
	}

	// getProjectDetails supprimée - remplacée par supabaseService.fetchProjectByCategoryAndName
	// findFeatureByProjectName supprimée - remplacée par supabaseService.fetchProjectByCategoryAndName

	// Exposer les fonctions nécessaires
	return {
		initConfig,
		layerData,
		loadLayer,
		preloadLayer,
		reloadLayer,
		createGeoJsonLayer,
		getFeatureStyle,
		clearLayerCache
		// Fonctions internes non exportées : bindFeatureEvents, generateTooltipContent
		// Fonctions supprimées : getProjectDetails (use supabaseService.fetchProjectByCategoryAndName)
		// Fonctions supprimées : openCoverLightbox (non utilisée)
	};
})();
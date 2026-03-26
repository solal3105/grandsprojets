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
	let iconMap = {};
	let iconColorMap = {};
	let defaultLayers = [];
	let layerData = {};

	// Exposer une méthode d'initialisation
	function initConfig({
		urlMap: u,
		styleMap: s,
		iconMap: i,
		iconColorMap: ic,
		defaultLayers: d
	}) {
		// Initialisation silencieuse en production
		urlMap = u || {};
		styleMap = s || {};
		iconMap = i || {};
		iconColorMap = ic || {};
		defaultLayers = d || [];

		// Vérification silencieuse en production
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

	// closeHoverTooltip SUPPRIMÉ - legacy Leaflet, non utilisé avec MapLibre GL

	const _esc = window.SecurityUtils.escapeHtml;

	// Lie les événements à une feature
	// Lines/Polygons : gérés par FeatureInteractions (MapLibre GL natif via queryRenderedFeatures)
	// Points (DOM markers) : events wired here (markers are invisible to queryRenderedFeatures)
	function bindFeatureEvents(layer, feature, geojsonLayer, layerName) {
		const isPoint = /Point$/i.test(feature?.geometry?.type || '');
		if (!isPoint) return;

		const props = feature?.properties || {};
		// Contribution point markers — wire DOM click/hover
		const isContrib = !!(props.project_name && props.category);
		const isTravaux = !!(props.nature_travaux || props.chantier_id);

		if ((isContrib || isTravaux) && layer.on) {
			// Register DOM marker with FeatureInteractions for overlap detection
			const FI = window.FeatureInteractions;
			if (FI?.registerMarker) FI.registerMarker(layer, feature);

			layer.on('mouseover', function() {
				if (!FI || !FI._mlMap) return;
				const latlng = layer.getLatLng?.();
				if (!latlng) return;
				FI._onDOMMarkerHover(layer, feature, { lng: latlng.lng, lat: latlng.lat });
				const el = layer.getElement?.();
				if (el) el.style.cursor = 'pointer';
			});

			layer.on('mouseout', function() {
				if (!FI) return;
				FI._endHover();
			});

			layer.on('click', function() {
				if (!FI || !FI._mlMap) return;
				const latlng = layer.getLatLng?.();
				if (!latlng) return;
				FI._onDOMMarkerClick(layer, feature, { lng: latlng.lng, lat: latlng.lat });
			});
		}
	}

	// Récupère les données d'une couche avec cache
	async function fetchLayerData(layerName) {
		const cacheKey = `layer_${layerName}`;
		
		// IMPORTANT: Vérifier si des contributions sont disponibles
		// Si oui et que le cache est vide, vider le cache pour forcer le rechargement
		const contributionProjects = window[`contributions_${layerName}`];
		if (contributionProjects && Array.isArray(contributionProjects) && contributionProjects.length > 0) {
			const cachedData = simpleCache._cache?.[cacheKey]?.value;
			const cachedFeaturesCount = cachedData?.features?.length || 0;
			if (cachedFeaturesCount === 0) {
				clearLayerCache(layerName);
			}
		}

		return simpleCache.get(cacheKey, async () => {
			// TRAVAUX
			if (window.LayerRegistry?.isTravauxLayer && window.LayerRegistry.isTravauxLayer(layerName)) {
				const normalizeTravaux = (data, sourceTag) =>
					window.TravauxModule?.normalizeGeoJSON?.(data, sourceTag)
						|| { type: 'FeatureCollection', features: Array.isArray(data?.features) ? data.features : [] };
				const activeCity = (typeof window.getActiveCity === 'function') 
					? window.getActiveCity() : (window.activeCity || 'metropole-lyon');
				const config = await window.supabaseService.getTravauxConfig(activeCity);
				
				if (!config) return { type: 'FeatureCollection', features: [] };
				
				if (config.source_type === 'url' && config.url) {
					try {
						const response = await fetch(config.url);
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						return normalizeTravaux(await response.json(), `travaux-url:${activeCity}`);
					} catch (error) {
						console.error('[DataModule] Erreur travaux URL:', error);
						return { type: 'FeatureCollection', features: [] };
					}
				} else if (config.source_type === 'city_travaux') {
					// Agrégation serveur via Netlify Function (1 requête au lieu de N+1)
					try {
						const fnUrl = `/.netlify/functions/travaux-geojson?ville=${encodeURIComponent(activeCity)}`;
						const resp = await fetch(fnUrl);
						if (resp.ok) {
							const data = await resp.json();
							if (data?.features?.length >= 0) return normalizeTravaux(data, `city-travaux:${activeCity}`);
						}
						console.warn('[DataModule] Netlify function indisponible, fallback client-side');
					} catch (_) {
						console.warn('[DataModule] Netlify function erreur, fallback client-side');
					}
					// Fallback : agrégation client-side (N+1 fetches)
					const data = await window.supabaseService.loadCityTravauxGeoJSON(activeCity);
					return normalizeTravaux(data, `city-travaux:${activeCity}`);
				}
				return { type: 'FeatureCollection', features: [] };
			}

			// CONTRIBUTIONS (chargement depuis Supabase) - PARALLÈLE LIMITÉ
			if (contributionProjects && Array.isArray(contributionProjects) && contributionProjects.length > 0) {
				// Limiter à 5 requêtes parallèles max pour éviter la surcharge réseau
				const BATCH_SIZE = 5;
				const projectsWithUrl = contributionProjects.filter(project => project.geojson_url);
				const allFeatures = [];
				
				for (let i = 0; i < projectsWithUrl.length; i += BATCH_SIZE) {
					const batch = projectsWithUrl.slice(i, i + BATCH_SIZE);
					const batchResults = await Promise.all(
						batch.map(async (project) => {
							try {
								const response = await fetch(project.geojson_url);
								if (!response.ok) return [];
								const geoData = await response.json();
								
								// Enrichir les features avec les métadonnées du projet
								const enrichFeature = (f) => {
									if (!f.properties) f.properties = {};
									f.properties.project_name = project.project_name;
									f.properties.category = project.category;
									f.properties.cover_url = project.cover_url;
									f.properties.description = project.description;
									f.properties.markdown_url = project.markdown_url;
									return f;
								};
								
								if (geoData.type === 'FeatureCollection' && geoData.features) {
									return geoData.features.map(enrichFeature);
								} else if (geoData.type === 'Feature') {
									return [enrichFeature(geoData)];
								}
								return [];
							} catch (error) {
								console.warn(`[DataModule] Erreur GeoJSON ${project.project_name}:`, error);
								return [];
							}
						})
					);
					allFeatures.push(...batchResults.flat());
				}
				
				return { type: 'FeatureCollection', features: allFeatures };
			}

			// LAYERS DEPUIS URL
			const url = urlMap[layerName];
			if (url) {
				try {
					const response = await fetch(url);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					return await response.json();
				} catch (error) {
					console.error(`[DataModule] Erreur layer "${layerName}":`, error);
					return { type: 'FeatureCollection', features: [] };
				}
			}

			return { type: 'FeatureCollection', features: [] };
		});
	}

	function getCategoryStyle(category) {
		const categoryIcon = window.categoryIcons?.find(c => c.category === category);
		const iconClass = categoryIcon?.icon_class || 'fa-solid fa-map-marker';
		let categoryColor = 'var(--primary)';
		if (categoryIcon?.category_styles) {
			try {
				const styles = typeof categoryIcon.category_styles === 'string' 
					? JSON.parse(categoryIcon.category_styles) 
					: categoryIcon.category_styles;
				categoryColor = styles.color || categoryColor;
			} catch (e) {
				console.warn('[DataModule] Parse error category_styles:', e);
			}
		}
		return { color: categoryColor, iconClass };
	}

	/**
	 * Crée un marker personnalisé avec design sobre et visible
	 * @param {string} category - Nom de la catégorie (optionnel)
	 * @param {string} iconOverride - Icône à utiliser (optionnel)
	 * @param {string} colorOverride - Couleur à utiliser (optionnel)
	 * @returns {L.DivIcon} Icône personnalisée
	 */
	function createCustomMarkerIcon(category = null, iconOverride = null, colorOverride = null) {
		// Récupérer les styles de la catégorie ou utiliser les overrides
		const { color, iconClass } = category ? getCategoryStyle(category) : { color: 'var(--primary)', iconClass: 'fa-solid fa-map-marker' };
		const finalColor = colorOverride || color;
		const finalIcon = window.normalizeIconClass(iconOverride || iconClass);
		
		// Créer le marker avec design sobre : pin blanc avec bordure colorée et icône
		return L.divIcon({
			html: `
				<div class="gp-custom-marker" style="--marker-color: ${finalColor};">
					<i class="${finalIcon}"></i>
				</div>
			`,
			className: 'gp-marker-container',
			iconSize: [32, 40],
			iconAnchor: [16, 40],
			popupAnchor: [0, -40]
		});
	}

	/**
	 * Crée un marker de contribution avec l'icône de sa catégorie
	 * @param {string} category - Nom de la catégorie
	 * @returns {L.DivIcon} Icône personnalisée avec l'icône de la catégorie
	 */
	function createContributionMarkerIcon(category) {
		return createCustomMarkerIcon(category);
	}

	/**
	 * Crée un marker simplifié (icône seule, sans le pin/pointeur)
	 * Utilisé pour les layers avec icône définie dans la table layers
	 * @param {string} iconClass - Classe Font Awesome de l'icône
	 * @param {string} color - Couleur de l'icône (CSS)
	 * @returns {L.DivIcon} Icône simple
	 */
	function createSimpleMarkerIcon(iconClass, color = 'var(--primary)') {
		const finalIcon = window.normalizeIconClass(iconClass, 'fa-map-marker');
		
		// Créer le marker simple : juste l'icône avec couleur et ombre
		return L.divIcon({
			html: `
				<div class="gp-simple-marker" style="--marker-color: ${color};">
					<i class="${finalIcon}"></i>
				</div>
			`,
			className: 'gp-simple-marker-container',
			iconSize: [24, 24],
			iconAnchor: [12, 12],
			popupAnchor: [0, -12]
		});
	}

	// Crée la couche GeoJSON et l'ajoute à la carte
	function createGeoJsonLayer(layerName, data) {
		const _t0 = performance.now();
		
		// Normaliser les données d'entrée pour éviter les erreurs Leaflet (addData(undefined))
		let normalized = data;
		try {
			if (!normalized || typeof normalized !== 'object') {
				console.warn(`[DataModule] ⚠️ Données invalides, utilisation collection vide`);
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
		// z-index Leaflet: tilePane=200, overlayPane=400, markerPane=600, tooltipPane=650, popupPane=700
		// On met clickableLayers à 450 pour être au-dessus de l'overlayPane mais EN DESSOUS des markers
		if (isClickable) {
			if (!window.clickableLayersPane) {
				window.clickableLayersPane = MapModule.map.createPane('clickableLayers');
				window.clickableLayersPane.style.zIndex = 450;
			}
		}

		// Fonction utilitaire pour vérifier les réseaux (déplacée côté serveur si possible)
		const RESEAU_KW = ['gaz', 'réseau', 'eau', 'branchement', 'télécom', 'telecom', 'électricité', 'electricite', 'assainissement'];
		const isReseau = (text) => {
			if (!text) return false;
			const t = String(text).toLowerCase();
			return RESEAU_KW.some(k => t.includes(k));
		};

		// Layers with per-feature styling must use SourcePool path (PathLayer objects)
		// All others use the direct path (raw GeoJSON → MapLibre source, zero overhead)
		const needsPerFeatureStyle = window.LayerRegistry?.isTravauxLayer?.(layerName) ||
			window.LayerRegistry?.isMetroLayer?.(layerName) ||
			window.LayerRegistry?.isPluLayer?.(layerName);

		const geojsonLayer = L.geoJSON(null, {
			_directPath: !needsPerFeatureStyle,
			pane: isClickable ? 'clickableLayers' : 'overlayPane', // Utiliser le panneau personnalisé pour les couches cliquables
			filter: feature => {
				const props = feature?.properties || {};
				
				// Filtre simple: masquer type "danger"
				if (props.type === 'danger') return false;
				
				// Points: keep contribution markers and travaux markers.
				// Some legacy/url-based travaux sources don't expose project_name.
				if (feature?.geometry?.type === 'Point') {
					if (window.LayerRegistry?.isTravauxLayer?.(layerName)) {
						return !!(props.project_name || props.name || props.nature_travaux || props.nature || props.nature_chantier || props.chantier_id != null);
					}
					return !!props.project_name;
				}
				
				// Filtres standards (optimisé)
				for (const [key, value] of Object.entries(criteria)) {
					if (key.startsWith('_')) continue;
					if (String(props[key] || '').toLowerCase() !== String(value).toLowerCase()) {
						return false;
					}
				}
				
				// Filtre réseaux (si activé)
				if (criteria._hideReseaux) {
					if (isReseau(props.nature_travaux) || isReseau(props.nature_chantier)) {
						return false;
					}
				}
				
				return true;
			},
			style: feature => getFeatureStyle(feature, layerName),
			pointToLayer: (feature, latlng) => {
				const props = feature?.properties || {};
				
				// 1. Travaux markers
				if (window.LayerRegistry?.isTravauxLayer?.(layerName)) {
					const icon = createCustomMarkerIcon(null, props.icon || 'fa-solid fa-helmet-safety', 'var(--color-warning)');
					return L.marker(latlng, { icon });
				}
				
				// 2. Contribution markers
				if (props.category) {
					return L.marker(latlng, { icon: createContributionMarkerIcon(props.category) });
				}
				
				// 3. Layer icon
				if (iconMap[layerName]) {
					const icon = createSimpleMarkerIcon(iconMap[layerName], iconColorMap[layerName] || 'var(--primary)');
					return L.marker(latlng, { icon });
				}
				
				// 4. Fallback
				return L.marker(latlng, { icon: createCustomMarkerIcon() });
			},
			onEachFeature: (feature, layer) => {
				bindFeatureEvents(layer, feature, geojsonLayer, layerName);
				
				// HITLINES SUPPRIMÉES - MapLibre GL gère les clics nativement
				// Les hitlines invisibles créaient des problèmes de performance
			}
		});

		// Remove any existing layer with the same name before adding the new one,
		// to prevent orphaned layers when createGeoJsonLayer is called without
		// an explicit prior removeLayer.
		MapModule.removeLayer(layerName);

		geojsonLayer.addData(data);
		geojsonLayer.addTo(MapModule.map);
		MapModule.addLayer(layerName, geojsonLayer);

		// Surcharge du line-width quand des filtres sont actifs (O(pools) au lieu de O(N²))
		if (criteria && Object.keys(criteria).length > 0) {
			const mlMap = MapModule.map?._mlMap || MapModule.map;
			if (L._sourcePool) L._sourcePool.setLineWidth(mlMap, 4);
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

	// --- Modale travaux (appelée par FeatureInteractions._onTravauxClick) ---
	async function openTravauxModal(props) {
		try {
			const modalContent = document.getElementById('travaux-modal-content');
			if (!modalContent) { console.error('[DataModule] travaux-modal-content introuvable'); return; }

			const progressPct = TravauxModule.calcProgress(props.date_debut, props.date_fin);
			const gradientBg = TravauxModule.calcGradient(progressPct);
			const debut = TravauxModule.safeDate(props.date_debut);
			const fin   = TravauxModule.safeDate(props.date_fin);
			const now = new Date();
			const dateFmt = (d) => d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
			const durationDays = (debut && fin && fin > debut) ? Math.max(1, Math.round((fin - debut) / 86400000)) : null;
			const todayPct = (debut && fin && fin > debut) ? Math.max(0, Math.min(100, ((now - debut) / (fin - debut)) * 100)) : 0;
			const todayColor = progressPct <= 50
				? ((progressPct / 50) * 100 < 50 ? 'var(--danger)' : 'var(--warning)')
				: (((progressPct - 50) / 50) * 100 < 50 ? 'var(--warning)' : 'var(--success)');
			const commune = props.commune || props.ville || props.COMMUNE || '';
			const titre = props.project_name || props.name || props.nature_travaux || props.nature || props.nature_chantier || 'Chantier';
			const etat = props.etat || '—';
			const etatLow = (etat || '').toLowerCase();
			const etatClass = etatLow.includes('ouver') ? 'etat--ouvert' : etatLow.includes('prochain') ? 'etat--prochain' : etatLow.includes('termin') ? 'etat--termine' : 'etat--neutre';
			const adrs = (props.adresse || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
			const chantierIcon = props.icon || 'fa-solid fa-helmet-safety';

			const html = `
			<div class="gp-travaux glass">
				<div class="gp-hero">
					<div class="hero-left">
						<span class="hero-icon"><i class="${_esc(chantierIcon)}"></i></span>
						<div>
							<div class="hero-title">${_esc(titre)}</div>
							<div class="hero-sub">${_esc(commune)}</div>
						</div>
					</div>
					<span class="etat-pill ${etatClass}">${_esc(etat)}</span>
				</div>
				<div class="gp-bento">
					<section class="tile tile--etat tile--timeline span-2">
						<h3>Avancement</h3>
						<div class="timeline">
							<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}" aria-label="Avancement des travaux">
								<div class="fill" data-target="${progressPct}" style="width:0%; background:${gradientBg}; box-shadow: 0 0 10px ${progressPct >= 100 ? 'var(--success-alpha-25)' : 'var(--warning-alpha-25)'}"></div>
								<div class="today" style="left:${todayPct}%; background:${todayColor}; box-shadow: 0 0 0 3px ${progressPct >= 100 ? 'var(--success-alpha-25)' : 'var(--warning-alpha-25)'}, 0 0 10px ${progressPct >= 100 ? 'var(--success-alpha-4)' : 'var(--warning-alpha-4)'};"></div>
							</div>
							<div class="dates"><span>${dateFmt(debut)}</span><span>${dateFmt(fin)}</span></div>
							<div class="meta"><span>${durationDays ? `${durationDays} jours` : ''}</span><span>${progressPct}%</span></div>
						</div>
					</section>
					<section class="tile">
						<h3>Natures</h3>
						<div class="badges">
							${props.nature_chantier ? `<span class="badge">${_esc(props.nature_chantier)}</span>` : ''}
							${props.nature_travaux ? `<span class="badge">${_esc(props.nature_travaux)}</span>` : ''}
						</div>
					</section>
					<section class="tile">
						<h3>Adresses</h3>
						<ul class="addresses ${adrs.length > 5 ? 'collapsed' : ''}">${adrs.map(a => `<li><span>${_esc(a)}</span></li>`).join('')}</ul>
						<div class="tile-actions">${adrs.length > 5 ? '<button class="toggle-addresses">Voir plus</button>' : ''}</div>
					</section>
				</div>
			</div>`;

			// Admin check
			const activeCity = (typeof window.getActiveCity === 'function') ? window.getActiveCity() : window.activeCity;
			let isAdmin = false;
			if (activeCity && activeCity !== 'default' && window.supabaseService) {
				try {
					const session = await window.supabaseService.getClient()?.auth.getSession();
					if (session?.data?.session?.user) {
						const role = window.__CONTRIB_ROLE || '';
						const villes = window.__CONTRIB_VILLES || [];
						isAdmin = role === 'admin' && (villes.includes('global') || villes.includes(activeCity));
					}
				} catch (_) {}
			}

			modalContent.innerHTML = html;

			window.ModalHelper.open('travaux-overlay', {
				dismissible: true, lockScroll: true, focusTrap: true,
				onOpen: () => {
					const modalEl = modalContent.querySelector('.gp-travaux');
					if (!modalEl) return;
					// Progress bar animation
					const fill = modalEl.querySelector('.timeline .fill');
					const target = Number(fill?.getAttribute('data-target') || 0);
					if (fill && !isNaN(target)) {
						requestAnimationFrame(() => { fill.style.width = '0%'; setTimeout(() => { fill.style.width = `${target}%`; }, 40); });
					}
					// Addresses toggle
					const toggleBtn = modalEl.querySelector('.toggle-addresses');
					if (toggleBtn) {
						const ul = modalEl.querySelector('.addresses');
						toggleBtn.addEventListener('click', () => {
							ul?.classList.toggle('collapsed');
							toggleBtn.textContent = toggleBtn.textContent.includes('plus') ? 'Voir moins' : 'Voir plus';
						});
					}
					// Admin actions
					if (isAdmin && props.chantier_id) {
						const actions = document.createElement('div');
						actions.className = 'gp-modal-actions';
						actions.style.cssText = 'display:flex;gap:12px;margin-top:20px;padding-top:20px;border-top:1px solid var(--border-light)';
						const editBtn = document.createElement('button');
						editBtn.className = 'btn-primary';
						editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Modifier';
						editBtn.onclick = () => { window.ModalHelper.close('travaux-overlay'); window.TravauxEditorModule?.openEditorForEdit?.(props.chantier_id); };
						const delBtn = document.createElement('button');
						delBtn.className = 'btn-danger';
						delBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Supprimer';
						delBtn.onclick = async () => {
							if (!confirm('Supprimer ce chantier ? Action irréversible.')) return;
							delBtn.disabled = true; delBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Suppression...';
							try {
								await window.supabaseService.deleteCityTravaux(props.chantier_id);
								window.ModalHelper.close('travaux-overlay');
								window.DataModule?.reloadLayer?.('travaux');
								window.ContribUtils?.showToast?.('Chantier supprimé', 'success');
							} catch (err) {
								console.error('[DataModule] Erreur suppression:', err);
								window.ContribUtils?.showToast?.('Erreur suppression', 'error');
								delBtn.disabled = false; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Supprimer';
							}
						};
						actions.appendChild(editBtn); actions.appendChild(delBtn);
						modalEl.appendChild(actions);
					}
				},
				onClose: () => { modalContent.innerHTML = ''; }
			});
		} catch (e) {
			console.error('[DataModule] Erreur ouverture modale travaux:', e);
		}
	}

	// Exposer les utilitaires partagés sur window (utilisés par ficheprojet, navigationmodule, contrib-map, travauxeditor)
	window.getCategoryStyle = getCategoryStyle;
	window.createCustomMarkerIcon = createCustomMarkerIcon;
	window.createContributionMarkerIcon = createContributionMarkerIcon;

	// Exposer les fonctions nécessaires
	return {
		initConfig,
		layerData,
		loadLayer,
		preloadLayer,
		reloadLayer,
		createGeoJsonLayer,
		getFeatureStyle,
		clearLayerCache,
		openTravauxModal
	};
})();
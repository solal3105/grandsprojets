// Cache ultra-simple en mémoire
const simpleCache = {
	_cache: {},
	_hits: 0,
	_misses: 0,
	_ttl: 600000,
	_ttlOverrides: { layer_travaux: 3600000 },

	async get(key, fetchFn) {
		if (key in this._cache) {
			const entry = this._cache[key];
			const ttl = this._ttlOverrides[key] || this._ttl;

			if (entry && Date.now() - entry.timestamp < ttl) {
				this._hits++;
				return entry.value ?? entry.promise;
			}
			delete this._cache[key];
		}

		this._misses++;

		const fetchPromise = (async () => {
			try {
				const data = await fetchFn();
				this._cache[key] = {
					value: data,
					timestamp: Date.now()
				};
				return data;
			} catch (error) {

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

	clear() {
		const count = Object.keys(this._cache).length;
		this._cache = {};
		this._hits = 0;
		this._misses = 0;
		return count;
	},

	debug() {
		return {
			size: Object.keys(this._cache).length,
			hits: this._hits,
			misses: this._misses,
			keys: []
		};
	}
};

window.DataModule = (function() {
	let urlMap = {};
	let styleMap = {};
	let iconMap = {};
	let iconColorMap = {};
	let layerData = {};

	function initConfig({
		urlMap: u,
		styleMap: s,
		iconMap: i,
		iconColorMap: ic,
		defaultLayers: _d
	}) {
		// Initialisation silencieuse en production
		urlMap = u || {};
		styleMap = s || {};
		iconMap = i || {};
		iconColorMap = ic || {};

		// Vérification silencieuse en production
	}

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

	function _safeSetStyle(layer, style) {
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

	const _esc = window.SecurityUtils.escapeHtml;

	// Lie les événements à une feature
	// Lines/Polygons : gérés par FeatureInteractions (MapLibre GL natif via queryRenderedFeatures)
	// Points (DOM markers) : events wired here (markers are invisible to queryRenderedFeatures)
	function bindFeatureEvents(layer, feature, _geojsonLayer, _layerName) {
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
				FI.endHover();
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
				const activeCity = window.CityManager?.getActiveCity() || 'metropole-lyon';
				// Use cached config from _cityModules, fallback to Supabase query
				const mod = (window._cityModules || []).find(m => m.module_key === 'travaux');
				const config = mod
					? { enabled: mod.enabled, ...mod.config }
					: await window.supabaseService.getTravauxConfig(activeCity);
				
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
						console.debug('[DataModule] Netlify function indisponible, fallback client-side');
					} catch (e) {
						console.debug('[DataModule] Netlify function erreur, fallback client-side:', e);
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
									f.properties.ville = project.ville;
									return f;
								};
								
								if (geoData.type === 'FeatureCollection' && geoData.features) {
									return geoData.features.map(enrichFeature);
								} else if (geoData.type === 'Feature') {
									return [enrichFeature(geoData)];
								}
								return [];
							} catch (error) {
								console.debug(`[DataModule] Erreur GeoJSON ${project.project_name}:`, error);
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
				console.debug('[DataModule] Parse error category_styles:', e);
			}
		}
		return { color: categoryColor, iconClass };
	}

	/**
	 * Crée un marker personnalisé avec design sobre et visible
	 * @param {string} category - Nom de la catégorie (optionnel)
	 * @param {string} iconOverride - Icône à utiliser (optionnel)
	 * @param {string} colorOverride - Couleur à utiliser (optionnel)
	 * @returns {Object} Icône personnalisée
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
	 * @returns {Object} Icône personnalisée avec l'icône de la catégorie
	 */
	function createContributionMarkerIcon(category) {
		return createCustomMarkerIcon(category);
	}

	/**
	 * Crée un marker simplifié (icône seule, sans le pin/pointeur)
	 * Utilisé pour les layers avec icône définie dans la table layers
	 * @param {string} iconClass - Classe Font Awesome de l'icône
	 * @param {string} color - Couleur de l'icône (CSS)
	 * @returns {Object} Icône simple
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
		
		// Normaliser les données d'entrée pour éviter les erreurs addData(undefined)
		let normalized = data;
		try {
			if (!normalized || typeof normalized !== 'object') {
				console.debug('[DataModule] Données invalides, utilisation collection vide');
				normalized = { type: 'FeatureCollection', features: [] };
			} else if (Array.isArray(normalized)) {
				normalized = { type: 'FeatureCollection', features: normalized };
			} else if (normalized.type === 'Feature') {
				normalized = { type: 'FeatureCollection', features: [normalized] };
			} else if (normalized.type === 'FeatureCollection' && !Array.isArray(normalized.features)) {
				normalized.features = [];
			}
		} catch (e) {
			console.debug('[data] GeoJSON normalization fallback:', e);
			normalized = { type: 'FeatureCollection', features: [] };
		}
		data = normalized;

		// Pre-compute progress colors for travaux features (avoids per-feature style + SourcePool overhead)
		if (window.LayerRegistry?.isTravauxLayer?.(layerName) && data.features?.length) {
			const rc = L._resolveColor || (c => c);
			const scale = [
				rc('var(--danger)'), rc('var(--danger)'), rc('var(--danger-hover)'), rc('var(--danger-hover)'), rc('var(--warning)'),
				rc('var(--warning)'), rc('var(--warning)'), rc('var(--success)'), rc('var(--success)'), rc('var(--success)')
			];
			const now = Date.now();
			for (let i = 0; i < data.features.length; i++) {
				const p = data.features[i].properties;
				if (!p) continue;
				const d = p.date_debut ? new Date(p.date_debut).getTime() : NaN;
				const e = p.date_fin   ? new Date(p.date_fin).getTime()   : NaN;
				const tsDebut = !isNaN(d) ? d : 0;
				const tsFin   = !isNaN(e) ? e : 9999999999999;
				if (!p._ts_debut) { p._ts_debut = tsDebut; p._ts_fin = tsFin; }
				const total = tsFin - tsDebut;
				let idx;
				if (total > 0) {
					const pct = Math.max(0, Math.min(100, Math.round(((now - tsDebut) / total) * 100)));
					idx = Math.round((pct / 100) * 9);
				} else if (!isNaN(d) || !isNaN(e)) {
					// Dates exist but equal / reversed — position relative to now
					idx = tsDebut > now ? 0 : 9;
				}
				if (idx !== undefined) {
					const resolved = scale[idx];
					// Only store if CSS vars were resolved (otherwise leave unset for next render pass)
					if (resolved && !resolved.startsWith('var(')) p._color = resolved;
				}
			}
		}

		const criteria = FilterModule.get(layerName);

		// Définir les couches cliquables (catégories dynamiques)
		const clickableLayers = (typeof window.getAllCategories === 'function') ?
			window.getAllCategories() :
			[];
		const isClickable = clickableLayers.includes(layerName);

		// Créer un panneau personnalisé pour les couches cliquables
		// z-index: tilePane=200, overlayPane=400, markerPane=600, tooltipPane=650, popupPane=700
		// On met clickableLayers à 450 pour être au-dessus de l'overlayPane mais EN DESSOUS des markers
		if (isClickable) {
			if (!window.clickableLayersPane) {
				window.clickableLayersPane = MapModule.map.createPane('clickableLayers');
				window.clickableLayersPane.style.zIndex = 450;
			}
		}

		// Layers with per-feature styling must use SourcePool path (PathLayer objects)
		// Travaux uses direct path with pre-computed _color (data-driven MapLibre expression)
		// All others use the direct path (raw GeoJSON → MapLibre source, zero overhead)
		const needsPerFeatureStyle = window.LayerRegistry?.isMetroLayer?.(layerName) ||
			window.LayerRegistry?.isPluLayer?.(layerName);

		const geojsonLayer = L.geoJSON(null, {
			_directPath: !needsPerFeatureStyle,
			_layerName: layerName,
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

	async function openTravauxModal(props) {
		try {
			const panel = document.getElementById('project-detail');
			if (!panel) return;

			// ── Données ──────────────────────────────────────────────────────
			const titre       = props.project_name || props.name || props.nature_travaux || props.nature || props.nature_chantier || 'Chantier';
			const etat        = props.etat || '—';
			const etatLow     = etat.toLowerCase();
			const etatClass   = etatLow.includes('ouver') ? 'etat--ouvert'
			                  : etatLow.includes('prochain') ? 'etat--prochain'
			                  : etatLow.includes('termin') ? 'etat--termine' : 'etat--neutre';
			const commune     = props.commune || props.ville || props.COMMUNE || '';
			const chantierIcon = props.icon || 'fa-solid fa-helmet-safety';
			const description = props.description || '';
			const adrs        = (props.adresse || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

			const progressPct  = TravauxModule.calcProgress(props.date_debut, props.date_fin);
			const gradientBg   = TravauxModule.calcGradient(progressPct);
			const debut        = TravauxModule.safeDate(props.date_debut);
			const fin          = TravauxModule.safeDate(props.date_fin);
			const now          = new Date();
			const dateFmt      = (d) => d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
			const durationDays = (debut && fin && fin > debut) ? Math.max(1, Math.round((fin - debut) / 86400000)) : null;
			const todayPct     = (debut && fin && fin > debut) ? Math.max(0, Math.min(100, ((now - debut) / (fin - debut)) * 100)) : 0;
			const todayColor   = progressPct <= 50
			                   ? (progressPct < 25 ? 'var(--danger)' : 'var(--warning)')
			                   : (progressPct < 75 ? 'var(--warning)' : 'var(--success)');

			const isPending = props.approved === false;

			// ── HTML — même structure que showProjectDetail ───────────────────
			const natures = [props.nature_chantier, props.nature_travaux].filter(Boolean);

			panel.innerHTML = `
				<div class="detail-overlay-btns">
					<button id="detail-back-btn" class="detail-back-floating" aria-label="Retour"><i class="fa-solid fa-arrow-left"></i></button>
					<button id="detail-close-btn" class="detail-close-floating" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
				</div>
				<div class="detail-scroll-body">
				<div class="detail-hero detail-hero--travaux" style="--travaux-color: var(--color-warning)">
					<div class="detail-hero__grad"></div>
					<div class="detail-hero__travaux-icon"><i class="${_esc(chantierIcon)}"></i></div>
				</div>
				<div class="detail-content-wrap">
					${isPending ? `
					<div class="tw-detail-pending-banner">
						<i class="fa-solid fa-clock"></i>
						<span>En attente de validation par un administrateur</span>
					</div>` : ''}
					<div class="detail-title-row">
						<span class="detail-cat-icon" style="--cat-color: var(--color-warning)"><i class="${_esc(chantierIcon)}"></i></span>
						<div style="flex:1;min-width:0">
							<h3 class="detail-title">${_esc(titre)}</h3>
							${commune ? `<div class="detail-description" style="margin:4px 0 0">${_esc(commune)}</div>` : ''}
						</div>
						<span class="etat-pill ${etatClass}" style="flex-shrink:0">${_esc(etat)}</span>
					</div>

					${natures.length ? `<div class="detail-chips">${natures.map(n => `<span class="detail-chip"><i class="fa-solid fa-hammer"></i>${_esc(n)}</span>`).join('')}</div>` : ''}

					<div class="tw-detail-timeline">
						<div class="tw-detail-timeline__bar" role="progressbar"
							aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}">
							<div class="tw-detail-timeline__fill" data-target="${progressPct}"
								style="width:0%;background:${gradientBg}"></div>
							<div class="tw-detail-timeline__today" style="left:${todayPct}%;background:${todayColor}"></div>
						</div>
						<div class="tw-detail-timeline__meta">
							<span>${dateFmt(debut)}</span>
							<span class="tw-detail-timeline__pct">${progressPct}%${durationDays ? ` · ${durationDays} j` : ''}</span>
							<span>${dateFmt(fin)}</span>
						</div>
					</div>

					${description ? `<p class="detail-description" style="margin-top:14px">${_esc(description)}</p>` : ''}

					${adrs.length ? `
					<div class="tw-detail-addresses">
						<div class="tw-detail-addresses__label"><i class="fa-solid fa-location-dot"></i> Localisation</div>
						<ul class="tw-detail-addresses__list addresses ${adrs.length > 5 ? 'collapsed' : ''}">
							${adrs.map(a => `<li>${_esc(a)}</li>`).join('')}
						</ul>
						${adrs.length > 5 ? `<button class="toggle-addresses" style="margin-top:6px;font-size:.8rem;background:none;border:none;color:var(--primary);cursor:pointer;padding:2px 0">Voir plus</button>` : ''}
					</div>` : ''}


				</div>
				</div>`;

			// ── Panneau ──────────────────────────────────────────────────────
			panel.style.setProperty('--cat-color', 'var(--color-warning)');
			panel.style.display = 'flex';

			// Collapse NavPanel + reset map padding (identique à showProjectDetail)
			window.NavPanel?.collapse();
			try {
				const mlMap = window.MapModule?.map?._mlMap;
				if (mlMap?.jumpTo) mlMap.jumpTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 } });
			} catch (e) { console.debug('[data] map padding reset failed:', e); }

			// ── Dismiss helper ────────────────────────────────────────────────
			const dismiss = () => {
				panel.style.display = 'none';
				panel.innerHTML = '';
				window.FeatureInteractions?.clearSelection?.();
				if (window.NavPanel?.getState?.()?.level > 0) {
					window.NavPanel.expand();
				} else {
					try {
						const mlMap = window.MapModule?.map?._mlMap;
						mlMap?.easeTo?.({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 300 });
					} catch (e) { console.debug('[data] map padding restore failed:', e); }
				}
			};

			panel.querySelector('#detail-back-btn')?.addEventListener('click', dismiss);
			panel.querySelector('#detail-close-btn')?.addEventListener('click', dismiss);

			// ── Progress animation ────────────────────────────────────────────
			const fill = panel.querySelector('.tw-detail-timeline__fill');
			const target = Number(fill?.getAttribute('data-target') || 0);
			if (fill) requestAnimationFrame(() => { fill.style.width = '0%'; setTimeout(() => { fill.style.width = `${target}%`; }, 40); });

			// ── Addresse toggle ───────────────────────────────────────────────
			const toggleBtn = panel.querySelector('.toggle-addresses');
			if (toggleBtn) {
				const ul = panel.querySelector('.tw-detail-addresses__list');
				toggleBtn.addEventListener('click', () => {
					ul?.classList.toggle('collapsed');
					toggleBtn.textContent = ul?.classList.contains('collapsed') ? 'Voir plus' : 'Voir moins';
				});
			}

		} catch (e) {
			console.error('[DataModule] Erreur ouverture détail chantier:', e);
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
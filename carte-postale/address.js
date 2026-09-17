/* Recherche nationale d'une adresse, d'un lieu ou d'une commune.
   Géoplateforme IGN : Base Adresse Nationale et lieux nommés de la BD TOPO. */
window.AddressSearch = (() => {
  'use strict';

  const API = 'https://data.geopf.fr/geocodage/search';

  function init({ onSelect }) {
    const container = document.getElementById('address-search');
    const input = document.getElementById('address');
    const list = document.getElementById('address-results');
    const status = document.getElementById('address-status');
    let results = [];
    let active = -1;
    let timer = null;
    let controller = null;
    let sequence = 0;

    function close() {
      clearTimeout(timer);
      controller?.abort();
      controller = null;
      sequence++;
      results = [];
      active = -1;
      list.replaceChildren();
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      status.textContent = '';
    }

    async function resolveCommune(result, signal) {
      if (result.commune.nom && /^[0-9A-Z]{5}$/i.test(result.commune.code) && !result.multipleCities) return result;
      // Certains lieux couvrent plusieurs communes ou n'en renseignent aucune.
      // Leurs coordonnées permettent de retrouver la bonne sans étape de saisie.
      const params = new URLSearchParams({ lat: result.lat, lon: result.lng, fields: 'nom,code,population' });
      const response = await fetch(`https://geo.api.gouv.fr/communes?${params}`, { signal });
      if (!response.ok) throw new Error('La commune ne peut pas être identifiée.');
      const cities = await response.json();
      const city = Array.isArray(cities) && cities.find((item) => item.nom && /^[0-9A-Z]{5}$/i.test(item.code));
      if (!city) throw new Error('Aucune commune ne correspond à ce lieu.');
      return { ...result, commune: city };
    }

    async function select(index) {
      const result = results[index];
      if (!result) return;
      close();
      input.value = result.label;
      input.focus({ preventScroll: true });
      const requestId = sequence;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 8000);
      status.textContent = 'Ouverture de la carte...';
      try {
        const location = await resolveCommune(result, request.signal);
        if (requestId !== sequence) return;
        onSelect(location);
        status.textContent = 'La carte est centrée sur ce lieu. Vous pouvez ajuster le cadrage.';
      } catch {
        if (requestId !== sequence) return;
        status.textContent = 'La commune n’a pas pu être identifiée. Choisissez un autre résultat ou réessayez.';
      } finally {
        clearTimeout(timeout);
        if (controller === request) controller = null;
      }
    }

    function render(features) {
      const seen = new Set();
      results = features.flatMap((feature) => {
        const point = feature.geometry;
        const properties = feature.properties || {};
        // Les lieux nommés renvoient des tableaux là où les adresses renvoient
        // des chaînes : les deux index partagent pourtant le même endpoint.
        const first = (value) => Array.isArray(value) ? value[0] : value;
        const name = properties.toponym || first(properties.name) || properties.label;
        const isCity = properties.type === 'municipality' || properties.category?.includes('commune');
        const cityName = first(properties.city) || (isCity ? name : '');
        const context = isCity ? [first(properties.postcode), properties.context].filter(Boolean).join(' · ')
          : [first(properties.postcode), cityName].filter(Boolean).join(' ');
        const label = properties.label || [name, context].filter(Boolean).join(' ');
        if (point?.type !== 'Point' || !Array.isArray(point.coordinates) || typeof label !== 'string'
          || !label) return [];
        const [lng, lat] = point.coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return [];
        const code = first(properties.citycode) || '';
        const type = isCity ? 'municipality' : properties.type || properties._type;
        const key = isCity && code ? `city:${code}` : `${type}:${label}:${lng}:${lat}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ lng, lat, label, name: name || label, context, type,
          multipleCities: Array.isArray(properties.citycode) && properties.citycode.length > 1,
          commune: { nom: cityName, code, population: Number(properties.population || properties.extrafields?.population) || 0 } }];
      }).slice(0, 6);
      for (const [index, result] of results.entries()) {
        const item = document.createElement('li');
        item.setAttribute('role', 'presentation');
        const button = document.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.id = `address-option-${index}`;
        button.dataset.index = String(index);
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');
        const title = document.createElement('span');
        title.className = 'n';
        title.textContent = result.name;
        button.appendChild(title);
        if (result.context) {
          const detail = document.createElement('span');
          detail.className = 'm';
          detail.textContent = result.context;
          button.appendChild(detail);
        }
        item.appendChild(button);
        list.appendChild(item);
      }
      list.hidden = !results.length;
      input.setAttribute('aria-expanded', String(!!results.length));
      status.textContent = results.length
        ? 'Choisissez un résultat pour centrer la carte.'
        : 'Aucun résultat. Essayez sans numéro ou ajoutez une ville ou un code postal.';
    }

    async function search() {
      close();
      const query = input.value.trim();
      if (query.length < 3) return;
      const requestId = sequence;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 8000);
      const params = new URLSearchParams({ q: query, index: 'address,poi', limit: '6', autocomplete: '1' });
      status.textContent = 'Recherche en cours...';
      try {
        const response = await fetch(`${API}?${params}`, { signal: request.signal });
        if (!response.ok) throw new Error('Le service de recherche est indisponible.');
        const data = await response.json();
        if (requestId !== sequence) return;
        render(Array.isArray(data.features) ? data.features : []);
      } catch {
        if (requestId !== sequence) return;
        status.textContent = 'La recherche est indisponible. Appuyez sur Entrée pour réessayer dans quelques instants.';
      } finally {
        clearTimeout(timeout);
        if (controller === request) controller = null;
      }
    }

    input.addEventListener('input', (event) => {
      close();
      if (event.isComposing) return;
      if (input.value.trim().length >= 3) timer = setTimeout(search, 250);
    });
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Tab') {
        close();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (results.length) select(active < 0 ? 0 : active);
        else search();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!results.length) return;
        active = active < 0 ? (event.key === 'ArrowDown' ? 0 : results.length - 1)
          : (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        const options = list.querySelectorAll('button');
        options.forEach((option, index) => {
          option.classList.toggle('is-choisi', index === active);
          option.setAttribute('aria-selected', String(index === active));
        });
        input.setAttribute('aria-activedescendant', options[active].id);
        options[active].scrollIntoView({ block: 'nearest' });
      }
    });
    // Le focus reste dans le champ jusqu'au clic, même sur les navigateurs
    // qui ne donnent pas le focus aux boutons à la souris. Le défilement
    // tactile reste libre : seule l'action de souris est neutralisée.
    list.addEventListener('mousedown', (event) => event.preventDefault());
    list.addEventListener('click', (event) => {
      const option = event.target.closest('button[data-index]');
      if (option) select(Number(option.dataset.index));
    });
    // On attend le clic complet : retirer une liste avant le relâchement
    // déplacerait le réglage visé et lui ferait perdre son clic.
    document.addEventListener('click', (event) => {
      if (!event.composedPath().includes(container) && (results.length || controller)) close();
    });

    return { focus() {
      input.focus();
      input.select();
      input.scrollIntoView({ block: 'nearest' });
    } };
  }

  return { init };
})();

(function() {
    try {
        console.log('[fiche] init dataset from URL');
        const params = new URLSearchParams(window.location.search || '');
        const rawCat = (params.get('cat') || '').toLowerCase();
        const projectParam = params.get('project') || '';
        const projectName = projectParam; // URLSearchParams décode déjà
        const article = document.getElementById('project-article');
        if (!article) return;

        // Déterminer layerName et éventuels filtres
        let layerName = '';
        let filterKey = '';
        let filterValue = '';
        const cat = (rawCat === 'transport') ? 'mobilite' : rawCat;
        switch (cat) {
          case 'velo':
            layerName = 'voielyonnaise';
            filterKey = 'line';
            try {
              const m = String(projectName).match(/(\d+)/);
              if (m) filterValue = m[1];
            } catch (_) {}
            break;
          case 'urbanisme':
            layerName = 'urbanisme';
            break;
          case 'mobilite':
          default:
            layerName = 'reseauProjeteSitePropre';
        }

        // Appliquer sur l'article
        if (projectName) article.dataset.projectName = projectName;
        if (layerName) article.dataset.layerName = layerName;
        if (filterKey) article.dataset.filterKey = filterKey;
        if (filterValue) article.dataset.filterValue = filterValue;
      } catch (e) {
        console.warn('[fiche] init dataset from URL failed:', e);
      }
})();
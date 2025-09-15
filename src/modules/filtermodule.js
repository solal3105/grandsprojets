// modules/FilterModule.js
export const FilterModule = (() => {
  const filters = {};

  const set = (layer, criteria) => { filters[layer] = criteria; };
  const reset = (layer) => { delete filters[layer]; };
  const resetAll = () => {
    Object.keys(filters).forEach(layer => delete filters[layer]);
  };
  const get = (layer) => filters[layer] || {};

  return { 
    filters,
    set,
    reset,
    resetAll,
    get
  };
})();

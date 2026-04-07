import { store } from './store.js';

function svc() {
  const s = window.supabaseService;
  if (!s) throw new Error('supabaseService not loaded');
  return s;
}

function client() {
  return window.AuthModule?.getClient();
}

function requireCity() {
  const city = store.city;
  if (!city) throw new Error('Aucune structure sélectionnée');
  return city;
}

export async function listContributions({ search, category, page = 1, pageSize = 20, mineOnly = false, sortBy = 'created_at', sortDir = 'desc' } = {}) {
  return svc().listContributions({ search, category, page, pageSize, mineOnly, sortBy, sortDir, city: requireCity() });
}

export async function getContribution(id) {
  return svc().getContributionById(id);
}

export async function approveContribution(id, approved) {
  return svc().setContributionApproved(id, approved);
}

export async function deleteContribution(id) {
  return svc().deleteContribution(id);
}

export async function updateContribution(id, patch) {
  return svc().updateContribution(id, patch);
}

export async function createContributionRow(projectName, category, meta, description, officialUrl, tags) {
  return svc().createContributionRow(projectName, category, requireCity(), meta, description, officialUrl, tags);
}

export async function uploadGeoJSON(file, category, projectName, rowId) {
  return svc().uploadGeoJSONToStorage(file, category, projectName, rowId);
}

export async function uploadCover(file, category, projectName, rowId) {
  return svc().uploadCoverToStorage(file, category, projectName, rowId);
}

export async function uploadMarkdown(blob, category, projectName, rowId) {
  return svc().uploadMarkdownToStorage(blob, category, projectName, rowId);
}

export async function uploadConsultationPdf(file, category, projectName, rowId) {
  return svc().uploadConsultationPdfToStorage(file, category, projectName, rowId);
}

export async function uploadArticleImage(file, category, projectName) {
  return svc().uploadArticleImageToStorage(file, category, projectName);
}

export async function getCategories() {
  return svc().getCategoryIconsByCity(requireCity());
}

export async function createCategory(data) {
  return svc().createCategoryIcon({ ...data, ville: requireCity() });
}

export async function updateCategory(originalName, updates) {
  return svc().updateCategoryIcon(requireCity(), originalName, updates);
}

export async function deleteCategory(categoryName) {
  return svc().deleteCategoryIcon(requireCity(), categoryName);
}

export async function getUsers() {
  const allUsers = await svc().getVisibleUsers();
  const city = requireCity();
  // Always filter by selected city — global admins see users of that city + global-access users
  return allUsers.filter(u => {
    const uVilles = Array.isArray(u.ville) ? u.ville : [];
    return uVilles.includes(city) || uVilles.includes('global');
  });
}

export async function updateUserRole(userId, newRole) {
  return svc().updateUserRole(userId, newRole);
}

export async function inviteUser(email, role) {
  const villes = [requireCity()];
  return svc().inviteUser(email, villes, role);
}

export async function getTravaux({ adminMode = true } = {}) {
  return svc().fetchCityTravaux(requireCity(), { adminMode });
}

export async function getTravauxItem(id) {
  return svc().getCityTravauxById(id);
}

export async function createTravaux(data) {
  return svc().createCityTravaux({ ...data, ville: requireCity() });
}

export async function updateTravaux(id, data) {
  return svc().updateCityTravaux(id, data);
}

export async function deleteTravaux(id) {
  return svc().deleteCityTravaux(id);
}

export async function uploadTravauxGeoJSON(geojson) {
  return svc().uploadTravauxGeoJSON(requireCity(), geojson);
}

export async function getTravauxConfig() {
  return svc().getTravauxConfig(requireCity());
}

export async function updateTravauxConfig(config) {
  return svc().updateTravauxConfig(requireCity(), config);
}

export async function getBranding() {
  return svc().getCityBranding(requireCity());
}

export async function updateBranding(data) {
  return svc().updateCity(requireCity(), data);
}

export async function uploadBrandingAsset(file, type) {
  return svc().uploadBrandingAsset(file, requireCity(), type);
}

export async function uploadBrandingAssetForCity(file, ville, type) {
  return svc().uploadBrandingAsset(file, ville, type);
}

export async function getAvailableCities() {
  return svc().getAvailableCities();
}

export async function getAllCities() {
  return svc().getAllCitiesForManagement();
}

export async function createCity(data) {
  return svc().createCity(data);
}

export async function updateCity(ville, data) {
  return svc().updateCity(ville, data);
}

export async function deleteCity(ville) {
  return svc().deleteCity(ville);
}

export async function getLayers() {
  const c = client();
  if (!c) return [];
  const city = requireCity();
  const { data, error } = await c
    .from('layers')
    .select('name, url, is_default, icon, icon_color')
    .eq('ville', city)
    .order('name');
  if (error) { console.error('[admin/api] getLayers:', error); return []; }
  return data || [];
}

export async function getConsultationDossiers(projectName) {
  return svc().getConsultationDossiersByProject(projectName);
}

export async function insertConsultationDossiers(projectName, category, docs, rowId) {
  return svc().insertConsultationDossiers(projectName, category, docs, rowId);
}

export async function deleteConsultationDossier(id) {
  return svc().deleteConsultationDossier(id);
}

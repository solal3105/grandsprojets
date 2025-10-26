/**
 * Helpers pour tester les toggles UI
 */

import { expect } from '@playwright/test';

/**
 * Attendre qu'un overlay soit ouvert (classe active + display flex)
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur de l'overlay
 * @param {number} timeout - Timeout en ms
 */
export async function waitForOverlayOpen(page, selector, timeout = 5000) {
  const overlay = page.locator(selector);
  
  // Attendre que l'overlay soit visible (display !== none + active + aria-hidden false)
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const ariaHidden = el.getAttribute('aria-hidden');
    return style.display !== 'none' && el.classList.contains('active') && ariaHidden === 'false';
  }, selector, { timeout });
  
  // Vérifier que l'overlay est bien visible
  await expect(overlay).toBeVisible({ timeout: 1000 });
}

/**
 * Attendre qu'un overlay soit fermé
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur de l'overlay
 * @param {number} timeout - Timeout en ms
 */
export async function waitForOverlayClosed(page, selector, timeout = 5000) {
  const overlay = page.locator(selector);
  
  // Attendre que l'overlay soit caché (display none + aria-hidden true)
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true; // Si l'élément n'existe pas, considérer comme fermé
    const style = window.getComputedStyle(el);
    const ariaHidden = el.getAttribute('aria-hidden');
    return style.display === 'none' || !el.classList.contains('active') || ariaHidden === 'true';
  }, selector, { timeout });
  
  // Vérifier que l'overlay est bien caché
  await expect(overlay).toBeHidden({ timeout: 1000 });
}

/**
 * Attendre qu'un menu soit ouvert (classe active uniquement)
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur du menu
 * @param {number} timeout - Timeout en ms
 */
export async function waitForMenuOpen(page, selector, timeout = 5000) {
  // Attendre que le menu ait la classe active
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el && el.classList.contains('active');
  }, selector, { timeout });
}

/**
 * Attendre qu'un menu soit fermé
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur du menu
 * @param {number} timeout - Timeout en ms
 */
export async function waitForMenuClosed(page, selector, timeout = 5000) {
  // Attendre que le menu n'ait plus la classe active
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !el || !el.classList.contains('active');
  }, selector, { timeout });
}

/**
 * Attendre qu'une modale soit ouverte (display flex + aria-hidden false)
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur de la modale
 * @param {number} timeout - Timeout en ms
 */
export async function waitForModalOpen(page, selector, timeout = 5000) {
  // Attendre que la modale soit visible (display !== none)
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const ariaHidden = el.getAttribute('aria-hidden');
    return style.display !== 'none' && ariaHidden === 'false';
  }, selector, { timeout });
  
  // Vérifier que la modale est bien visible
  const modal = page.locator(selector);
  await expect(modal).toBeVisible({ timeout: 1000 });
}

/**
 * Attendre qu'une modale soit fermée
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur de la modale
 * @param {number} timeout - Timeout en ms
 */
export async function waitForModalClosed(page, selector, timeout = 5000) {
  // Attendre que la modale soit cachée
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    const style = window.getComputedStyle(el);
    const ariaHidden = el.getAttribute('aria-hidden');
    return style.display === 'none' || ariaHidden === 'true';
  }, selector, { timeout });
  
  // Vérifier que la modale est bien cachée
  const modal = page.locator(selector);
  await expect(modal).toBeHidden({ timeout: 1000 });
}

/**
 * Attendre qu'un élément cible soit affiché (display block)
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur de l'élément
 * @param {number} timeout - Timeout en ms
 */
export async function waitForTargetShown(page, selector, timeout = 5000) {
  // Attendre que l'élément cible soit visible
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none';
  }, selector, { timeout });
  
  const target = page.locator(selector);
  await expect(target).toBeVisible({ timeout: 1000 });
}

/**
 * Attendre qu'un élément cible soit caché (display none)
 * @param {import('@playwright/test').Page} page
 * @param {string} selector - Sélecteur de l'élément
 * @param {number} timeout - Timeout en ms
 */
export async function waitForTargetHidden(page, selector, timeout = 5000) {
  // Attendre que l'élément cible soit caché
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    const style = window.getComputedStyle(el);
    return style.display === 'none';
  }, selector, { timeout });
  
  const target = page.locator(selector);
  await expect(target).toBeHidden({ timeout: 1000 });
}

/**
 * Vérifier l'état ARIA d'un toggle
 * @param {import('@playwright/test').Page} page
 * @param {string} toggleSelector - Sélecteur du toggle
 * @param {boolean} pressed - État attendu
 */
export async function expectToggleState(page, toggleSelector, pressed) {
  const toggle = page.locator(toggleSelector);
  await expect(toggle).toHaveAttribute('aria-pressed', pressed.toString());
}

/**
 * Vérifier l'état expanded d'un toggle avec menu/overlay
 * @param {import('@playwright/test').Page} page
 * @param {string} toggleSelector - Sélecteur du toggle
 * @param {boolean} expanded - État attendu
 */
export async function expectToggleExpanded(page, toggleSelector, expanded) {
  const toggle = page.locator(toggleSelector);
  await expect(toggle).toHaveAttribute('aria-expanded', expanded.toString());
}

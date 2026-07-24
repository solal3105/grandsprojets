// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Attend que supabaseService soit chargé sur la carte publique.
 * Le helper de compression est pur client - pas besoin d'auth ni du boot complet.
 */
async function waitForService(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof window.supabaseService?.compressImage === 'function',
    { timeout: 20000 }
  );
}

/**
 * Fabrique une image bruitée dans le navigateur et la passe au helper.
 * Le bruit évite qu'un aplat se compresse trop bien et fausse les mesures.
 * @returns {Promise<{src:{size:number,type:string}, out:{size:number,type:string,width:number}|null}>}
 */
function runCompress(page, { width, height, srcType, srcQuality, opts }) {
  return page.evaluate(async ({ width, height, srcType, srcQuality, opts }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    let seed = 42;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      img.data[i] = seed % 256;
      img.data[i + 1] = (seed >> 8) % 256;
      img.data[i + 2] = (seed >> 16) % 256;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const srcBlob = await new Promise((r) => canvas.toBlob(r, srcType, srcQuality));
    const ext = srcType.split('/')[1];
    const file = new File([srcBlob], `test.${ext}`, { type: srcType });

    const out = await window.supabaseService.compressImage(file, opts);
    if (!out) return { src: { size: file.size, type: file.type }, out: null };

    const bmp = await createImageBitmap(out);
    return {
      src: { size: file.size, type: file.type },
      out: { size: out.size, type: out.type, width: bmp.width },
    };
  }, { width, height, srcType, srcQuality, opts });
}

/** Passe un fichier au helper sans le décoder (mime seul). */
function runCompressRaw(page, { bytes, name, type }) {
  return page.evaluate(async ({ bytes, name, type }) => {
    const file = new File([new Uint8Array(bytes)], name, { type });
    const out = await window.supabaseService.compressImage(file);
    return out === null ? null : { size: out.size, type: out.type };
  }, { bytes, name, type });
}

// ─────────────────────────────────────────────────────────
// 0.29 - Compression des images à l'upload
// ─────────────────────────────────────────────────────────
test.describe('0.29 - Compression des images à l\'upload', () => {

  test('0.29.1 - Un PNG volumineux est converti en WebP et allégé', async ({ page }) => {
    await waitForService(page);
    const { src, out } = await runCompress(page, {
      width: 2400, height: 1600, srcType: 'image/png', srcQuality: undefined,
      opts: { maxWidth: 1920 },
    });
    expect(out).not.toBeNull();
    expect(out.type).toBe('image/webp');
    expect(out.size).toBeLessThan(src.size);
  });

  test('0.29.2 - Le redimensionnement respecte maxWidth', async ({ page }) => {
    await waitForService(page);
    const { out } = await runCompress(page, {
      width: 2400, height: 1600, srcType: 'image/png', srcQuality: undefined,
      opts: { maxWidth: 1920 },
    });
    expect(out).not.toBeNull();
    expect(out.width).toBe(1920);
  });

  test('0.29.3 - Une image plus petite que maxWidth n\'est pas agrandie', async ({ page }) => {
    await waitForService(page);
    const { out } = await runCompress(page, {
      width: 400, height: 300, srcType: 'image/png', srcQuality: undefined,
      opts: { maxWidth: 1920 },
    });
    expect(out).not.toBeNull();
    expect(out.width).toBe(400);
  });

  test('0.29.4 - Un SVG n\'est jamais rasterisé', async ({ page }) => {
    await waitForService(page);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>';
    const out = await page.evaluate(async (svg) => {
      const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' });
      const res = await window.supabaseService.compressImage(file);
      return res === null ? null : { size: res.size, type: res.type };
    }, svg);
    expect(out).toBeNull();
  });

  test('0.29.5 - Un GIF n\'est jamais touché (animation préservée)', async ({ page }) => {
    await waitForService(page);
    // En-tête GIF89a - le helper doit sortir sur le mime avant tout décodage
    const out = await runCompressRaw(page, {
      bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], name: 'anim.gif', type: 'image/gif',
    });
    expect(out).toBeNull();
  });

  test('0.29.6 - Un favicon .ico n\'est jamais touché', async ({ page }) => {
    await waitForService(page);
    const out = await runCompressRaw(page, {
      bytes: [0x00, 0x00, 0x01, 0x00], name: 'favicon.ico', type: 'image/x-icon',
    });
    expect(out).toBeNull();
  });

  test('0.29.7 - Un non-image est refusé', async ({ page }) => {
    await waitForService(page);
    const out = await runCompressRaw(page, {
      bytes: [0x25, 0x50, 0x44, 0x46], name: 'doc.pdf', type: 'application/pdf',
    });
    expect(out).toBeNull();
  });

  test('0.29.8 - Un WebP déjà optimisé n\'est pas regonflé', async ({ page }) => {
    await waitForService(page);
    // Source encodée très bas : la ré-encoder à q0.82 la rendrait plus lourde
    const { out } = await runCompress(page, {
      width: 300, height: 300, srcType: 'image/webp', srcQuality: 0.02,
      opts: { maxWidth: 1920, quality: 0.82 },
    });
    expect(out).toBeNull();
  });

  test('0.29.9 - Le mime PNG est respecté (chemin favicon)', async ({ page }) => {
    await waitForService(page);
    const { src, out } = await runCompress(page, {
      width: 1024, height: 1024, srcType: 'image/png', srcQuality: undefined,
      opts: { maxWidth: 128, mime: 'image/png' },
    });
    expect(out).not.toBeNull();
    // Un favicon doit rester PNG : jamais de WebP en <link rel="icon">
    expect(out.type).toBe('image/png');
    expect(out.width).toBe(128);
    expect(out.size).toBeLessThan(src.size);
  });
});

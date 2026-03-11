import { test, expect } from '@playwright/test';

test.describe('Click Flicker Test', () => {
  test('should not flicker when clicking on a contribution', async ({ page }) => {
    // Écouter les logs console
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      console.log('[BROWSER]', text);
    });

    // Naviguer vers l'app
    await page.goto('http://localhost:3001');
    
    // Attendre que la carte soit chargée
    await page.waitForSelector('#map', { timeout: 10000 });
    await page.waitForTimeout(3000); // Attendre que les layers se chargent

    // Prendre un snapshot avant le clic
    const snapshotBefore = await page.locator('#map').screenshot();
    
    // Trouver et cliquer sur une contribution (premier élément visible sur la carte)
    // On va cliquer au centre de la carte où il devrait y avoir des contributions
    const mapElement = await page.locator('#map');
    const box = await mapElement.boundingBox();
    
    if (box) {
      // Cliquer au centre de la carte
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      console.log('✅ Clicked on map center');
      
      // Attendre un peu pour voir si ça clignote
      await page.waitForTimeout(1000);
      
      // Vérifier les logs
      const clickLogs = logs.filter(log => log.includes('[DataModule] 🖱️ CLICK EVENT'));
      const showDetailPanelLogs = logs.filter(log => log.includes('[UIModule] 📋 showDetailPanel'));
      const showProjectDetailLogs = logs.filter(log => log.includes('[NavigationModule] 🎯 showProjectDetail'));
      const popstateLogs = logs.filter(log => log.includes('[Main] 🔙 POPSTATE'));
      
      console.log('\n📊 Log Analysis:');
      console.log(`- Click events: ${clickLogs.length}`);
      console.log(`- showDetailPanel calls: ${showDetailPanelLogs.length}`);
      console.log(`- showProjectDetail calls: ${showProjectDetailLogs.length}`);
      console.log(`- Popstate events: ${popstateLogs.length}`);
      
      // Assertions: ne devrait avoir qu'UN seul appel de chaque
      expect(clickLogs.length).toBeLessThanOrEqual(1);
      expect(showDetailPanelLogs.length).toBeLessThanOrEqual(1);
      expect(showProjectDetailLogs.length).toBeLessThanOrEqual(1);
      
      // Popstate ne devrait PAS être déclenché par un clic manuel
      expect(popstateLogs.length).toBe(0);
      
      console.log('✅ No flickering detected - all guards working correctly');
    }
  });
});

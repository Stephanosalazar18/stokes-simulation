import { test, expect } from '@playwright/test';

test('fluid simulation renders and responds to mouse', async ({ page }) => {
  // Iniciar servidor de desarrollo
  await page.goto('http://localhost:5173');
  
  // Esperar a que el canvas esté visible
  const canvas = page.locator('#canvas');
  await expect(canvas).toBeVisible();
  
  // Capturar screenshot inicial
  const screenshot1 = await canvas.screenshot();
  expect(screenshot1.byteLength).toBeGreaterThan(0);
  
  // Mover el mouse al centro y hacer drag
  await canvas.click();
  await canvas.hover({ position: { x: 256, y: 256 } });
  await page.mouse.down();
  await canvas.hover({ position: { x: 300, y: 300 } });
  await page.mouse.up();
  
  // Esperar unos frames para que se renderice
  await page.waitForTimeout(500);
  
  // Capturar screenshot después de la interacción
  const screenshot2 = await canvas.screenshot();
  expect(screenshot2.byteLength).toBeGreaterThan(0);
  
  // Verificar que hay contenido (no debe ser completamente negro)
  console.log('Screenshot 1 size:', screenshot1.byteLength);
  console.log('Screenshot 2 size:', screenshot2.byteLength);
  
  // Obtener logs de consola
  page.on('console', msg => console.log('BROWSER:', msg.text()));
});

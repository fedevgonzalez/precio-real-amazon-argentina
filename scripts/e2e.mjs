import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('Uso: node scripts/e2e.mjs <url-de-producto> [<url> ...]');
  process.exit(1);
}

const ext = path.resolve('.');
fs.mkdirSync('.tmp', { recursive: true });
fs.mkdirSync('tests/fixtures', { recursive: true });

const ctx = await chromium.launchPersistentContext(path.resolve('.tmp/profile'), {
  headless: false,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

let n = 0;
for (const url of urls) {
  n += 1;
  const page = await ctx.newPage();
  page.on('console', (m) => m.text().startsWith('[aar]') && console.log(`  consola: ${m.text()}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Contador de remontajes: cada inserción de un nodo #aar-block (propio o dentro
  // del subárbol insertado) durante la ventana de observación suma 1.
  await page.evaluate(() => {
    window.__aarRemontajes = 0;
    const esAar = (nodo) =>
      nodo instanceof Element && (nodo.id === 'aar-block' || !!nodo.querySelector('#aar-block'));
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const nodo of m.addedNodes) if (esAar(nodo)) window.__aarRemontajes += 1;
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.waitForTimeout(5000);

  const remontajes = await page.evaluate(() => window.__aarRemontajes ?? 0);
  const block = await page.locator('#aar-block').first().textContent({ timeout: 2000 }).catch(() => null);
  console.log(`${block ? 'OK  ' : 'FALLA'} ${url}`);
  console.log(`  remontajes: ${remontajes}`);
  console.log(`  texto: ${block ?? 'no apareció #aar-block'}`);
  await page.screenshot({ path: `.tmp/e2e-${n}.png` });

  const fixture = await page.evaluate(() =>
    ['#corePrice_feature_div', '#mir-layout-DELIVERY_BLOCK']
      .map((s) => document.querySelector(s)?.outerHTML ?? '')
      .join('\n'),
  );
  // Un fixture vacío (captcha, página sin precio) no se guarda para no pisar
  // un fixture real bueno de una corrida anterior.
  if (fixture.trim() === '') {
    console.log('  fixture vacío: no se guarda (¿captcha o página sin precio?)');
  } else {
    fs.writeFileSync(`tests/fixtures/real-${n}.html`, `<body>${fixture}</body>`);
  }
  await page.close();
}
await ctx.close();

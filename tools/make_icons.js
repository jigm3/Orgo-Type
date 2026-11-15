// Renders the app icons (a ketone skeleton, the C=O drawn in the accent colour) with the pre-installed Playwright.
// Run: node tools/make_icons.js   (writes icons/*.png)
const { chromium } = require('playwright');
const path = require('path');
const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0f141b"/>
  <g transform="translate(256 286) scale(${pad ? 0.72 : 0.92}) translate(-256 -286)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="96,352 256,260 416,352" stroke="#e7e3db" stroke-width="30"/>
    <line x1="236" y1="262" x2="236" y2="128" stroke="#f0b44c" stroke-width="26"/>
    <line x1="276" y1="262" x2="276" y2="128" stroke="#f0b44c" stroke-width="26"/>
    <circle cx="256" cy="98" r="38" fill="#ff8a7a" stroke="none"/>
  </g></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const out = [['icon-512.png',512,0],['icon-192.png',192,0],['apple-touch-icon.png',180,1],['maskable-512.png',512,1],['favicon.png',64,0]];
  for (const [name, size, pad] of out) {
    await p.setViewportSize({width:size,height:size});
    await p.setContent(`<html><body style="margin:0;background:transparent">${icon(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await p.screenshot({path: path.join(__dirname, '..', 'icons', name), omitBackground: true});
  }
  await b.close();
})();

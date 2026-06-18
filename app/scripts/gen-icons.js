// Generates all app icon PNGs from the "Supernova Spark" (Concept 02) design.
// Run: node scripts/gen-icons.js   (from the app/ directory)
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'assets', 'images');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ---- SVG building blocks (Supernova Spark) ----

// Full icon: dark radial background + glowing 4-point star + tiny stars
const fullIcon = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.42" r="0.85">
      <stop offset="0" stop-color="#11294a"/><stop offset="1" stop-color="#04060d"/>
    </radialGradient>
    <linearGradient id="star" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#aef6ff"/><stop offset="0.5" stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g filter="url(#glow)" fill="url(#star)">
    <path d="M256 86 l36 134 134 36 -134 36 -36 134 -36 -134 -134 -36 134 -36 z"/>
  </g>
  <circle cx="388" cy="146" r="7" fill="#aef6ff"/>
  <circle cx="124" cy="372" r="5" fill="#7dd3fc"/>
  <circle cx="404" cy="386" r="4" fill="#67e8f9"/>
  <circle cx="120" cy="150" r="3.5" fill="#67e8f9"/>
</svg>`;

// Foreground only (transparent bg, star sized within the adaptive-icon safe zone ~66%)
const foreground = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="star" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#aef6ff"/><stop offset="0.5" stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#glow)" fill="url(#star)">
    <path d="M256 130 l30 110 110 30 -110 30 -30 110 -30 -110 -110 -30 110 -30 z"/>
  </g>
</svg>`;

// Monochrome foreground (single colour silhouette for Android 13+ themed icons)
const monochrome = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <g fill="#ffffff">
    <path d="M256 130 l30 110 110 30 -110 30 -30 110 -30 -110 -110 -30 110 -30 z"/>
  </g>
</svg>`;

// Solid adaptive background tile
const background = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.42" r="0.9">
      <stop offset="0" stop-color="#0c2038"/><stop offset="1" stop-color="#04060d"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
</svg>`;

// Splash icon: star only on transparent (splash bg colour comes from app.json)
const splash = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="star" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#aef6ff"/><stop offset="0.5" stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <g fill="url(#star)">
    <path d="M256 96 l34 126 126 34 -126 34 -34 126 -34 -126 -126 -34 126 -34 z"/>
  </g>
</svg>`;

async function render(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(OUT, file));
  console.log('  wrote', file);
}

(async () => {
  console.log('Generating NOVA spark icons...');
  await render(fullIcon(1024), 1024, 'icon.png');
  await render(foreground(1024), 1024, 'android-icon-foreground.png');
  await render(monochrome(1024), 1024, 'android-icon-monochrome.png');
  await render(background(1024), 1024, 'android-icon-background.png');
  await render(splash(512), 512, 'splash-icon.png');
  await render(fullIcon(196), 196, 'favicon.png');
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });

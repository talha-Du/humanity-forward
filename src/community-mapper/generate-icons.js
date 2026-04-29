const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 192, 512];
const iconsDir = path.join(__dirname, 'icons');

// SVG icon with a map pin and humanity forward theme
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a73e8"/>
      <stop offset="100%" style="stop-color:#0d47a1"/>
    </linearGradient>
    <linearGradient id="pin" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ff5252"/>
      <stop offset="100%" style="stop-color:#d32f2f"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.3"/>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="128" fill="url(#bg)"/>
  <!-- Map grid lines -->
  <g stroke="rgba(255,255,255,0.15)" stroke-width="2" fill="none">
    <line x1="128" y1="0" x2="128" y2="512"/>
    <line x1="256" y1="0" x2="256" y2="512"/>
    <line x1="384" y1="0" x2="384" y2="512"/>
    <line x1="0" y1="128" x2="512" y2="128"/>
    <line x1="0" y1="256" x2="512" y2="256"/>
    <line x1="0" y1="384" x2="512" y2="384"/>
  </g>
  <!-- Map pin -->
  <g transform="translate(256, 200)" filter="url(#shadow)">
    <path d="M0,-80 C-44,-80 -80,-44 -80,0 C-80,56 0,120 0,120 C0,120 80,56 80,0 C80,-44 44,-80 0,-80 Z" fill="url(#pin)"/>
    <circle cx="0" cy="0" r="28" fill="white"/>
    <path d="M-10,-4 L-3,-4 L-3,-12 L3,-12 L3,-4 L10,-4 L10,2 L3,2 L3,12 L-3,12 L-3,2 L-10,2 Z" fill="#d32f2f"/>
  </g>
  <!-- Humanity Forward text -->
  <text x="256" y="380" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="bold" fill="white">Humanity</text>
  <text x="256" y="420" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="bold" fill="white">Forward</text>
  <text x="256" y="460" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="rgba(255,255,255,0.7)">Community Mapper</text>
</svg>`;

async function generateIcons() {
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(Buffer.from(svgIcon))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }
  console.log('All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});

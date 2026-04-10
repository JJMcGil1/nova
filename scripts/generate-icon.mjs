/**
 * generate-icon.mjs
 *
 * Generates macOS .iconset PNGs and .icns from a pure-SVG replica of NovaIcon.
 * Run:  node scripts/generate-icon.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// 1. Build the SVG string  (size=1024, radius=224)
// ---------------------------------------------------------------------------

const size = 1024;
const radius = 224;
const id = "nova-1024";
const c = size / 2; // 512
const u = size / 512; // 2

// --- Deterministic star field (35 stars) ---
const stars = [];
for (let i = 0; i < 35; i++) {
  stars.push({
    x: (Math.sin(i * 7.3 + 1.2) * 0.5 + 0.5) * size,
    y: (Math.cos(i * 5.1 + 3.4) * 0.5 + 0.5) * size,
    r: (0.3 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 1.2) * u,
    o: 0.15 + (Math.cos(i * 2.9) * 0.5 + 0.5) * 0.55,
  });
}

// --- Ray helper ---
function ray(angle, length, width, color, opacity) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x2 = c + Math.cos(rad) * length * u;
  const y2 = c + Math.sin(rad) * length * u;
  return `<line x1="${c}" y1="${c}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width * u}" stroke-linecap="round" opacity="${opacity}"/>`;
}

// --- Companion star helper ---
function companion(cx, cy, r, color, lightColor, opacity) {
  const px = cx * u + c;
  const py = cy * u + c;
  return [
    `<circle cx="${px}" cy="${py}" r="${r * 1.8 * u}" fill="${color}" opacity="${opacity * 0.1}" filter="url(#${id}-sg)"/>`,
    `<circle cx="${px}" cy="${py}" r="${r * u}" fill="${color}" opacity="${opacity}"/>`,
    `<circle cx="${px}" cy="${py}" r="${r * 0.45 * u}" fill="${lightColor}" opacity="${opacity * 1.2}"/>`,
  ].join("\n");
}

// --- Build rays ---
const rays = [];
// Cardinal wide
[0, 90, 180, 270].forEach((a) => rays.push(ray(a, 210, 2.8, "#A89DEA", 0.4)));
// Cardinal narrow overlay
[0, 90, 180, 270].forEach((a) => rays.push(ray(a, 210, 1.2, "#C8BFFF", 0.25)));
// Diagonal wide
[45, 135, 225, 315].forEach((a) => rays.push(ray(a, 160, 1.8, "#B0A5F0", 0.28)));
// Diagonal narrow overlay
[45, 135, 225, 315].forEach((a) => rays.push(ray(a, 160, 0.8, "#D4CCFF", 0.18)));
// Tertiary
[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].forEach((a) =>
  rays.push(ray(a, 110, 0.8, "#CECBF6", 0.15))
);

// --- Sparkle dots ---
const sparkleData = [
  [0.22, 0.18, 1.8, 0.5],
  [0.78, 0.22, 1.4, 0.4],
  [0.18, 0.72, 1.2, 0.35],
  [0.82, 0.75, 1.6, 0.45],
  [0.5, 0.12, 1, 0.3],
  [0.5, 0.88, 1.1, 0.3],
  [0.12, 0.45, 0.9, 0.25],
  [0.88, 0.5, 1, 0.3],
];
const sparkles = sparkleData
  .map(([px, py, pr, po]) => {
    const sx = px * size;
    const sy = py * size;
    return [
      `<circle cx="${sx}" cy="${sy}" r="${pr * u * 2}" fill="#C8BFFF" opacity="${po * 0.15}" filter="url(#${id}-tg)"/>`,
      `<circle cx="${sx}" cy="${sy}" r="${pr * u}" fill="#E8E4FF" opacity="${po}"/>`,
    ].join("\n");
  })
  .join("\n");

// --- Specular highlight ---
const specCx = c - 12 * u;
const specCy = c - 14 * u;

// --- Assemble full SVG ---
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="${id}-clip">
      <rect width="${size}" height="${size}" rx="${radius}"/>
    </clipPath>

    <!-- Background -->
    <radialGradient id="${id}-bg" cx="50%" cy="46%" r="75%">
      <stop offset="0%" stop-color="#1A1440"/>
      <stop offset="35%" stop-color="#110D2A"/>
      <stop offset="70%" stop-color="#0A0718"/>
      <stop offset="100%" stop-color="#050310"/>
    </radialGradient>

    <!-- Nebula layers -->
    <radialGradient id="${id}-n1" cx="35%" cy="40%" r="45%">
      <stop offset="0%" stop-color="#7B3FA0" stop-opacity="0.18"/>
      <stop offset="40%" stop-color="#5C2D91" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#2A1555" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-n2" cx="65%" cy="60%" r="40%">
      <stop offset="0%" stop-color="#1B5E8A" stop-opacity="0.14"/>
      <stop offset="50%" stop-color="#0D3A5C" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#071E30" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-n3" cx="55%" cy="35%" r="30%">
      <stop offset="0%" stop-color="#C45528" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#6B2A10" stop-opacity="0"/>
    </radialGradient>

    <!-- Aura -->
    <radialGradient id="${id}-au" cx="50%" cy="50%" r="38%">
      <stop offset="0%" stop-color="#9B8FFF" stop-opacity="0.35"/>
      <stop offset="30%" stop-color="#7B6FE0" stop-opacity="0.18"/>
      <stop offset="60%" stop-color="#5545B0" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#2A1F6B" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-aw" cx="50%" cy="52%" r="28%">
      <stop offset="0%" stop-color="#E89070" stop-opacity="0.15"/>
      <stop offset="60%" stop-color="#D06040" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#802010" stop-opacity="0"/>
    </radialGradient>

    <!-- Core layers -->
    <radialGradient id="${id}-co" cx="46%" cy="40%" r="52%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="15%" stop-color="#F5F2FF"/>
      <stop offset="35%" stop-color="#D4CCFF"/>
      <stop offset="60%" stop-color="#A89DEA"/>
      <stop offset="100%" stop-color="#6B5FC0"/>
    </radialGradient>
    <radialGradient id="${id}-ci" cx="44%" cy="38%" r="50%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="50%" stop-color="#F0EDFF"/>
      <stop offset="100%" stop-color="#D8D2F8"/>
    </radialGradient>
    <radialGradient id="${id}-cw" cx="42%" cy="36%" r="50%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F0EDFF"/>
    </radialGradient>

    <!-- Central flare -->
    <radialGradient id="${id}-fl" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
      <stop offset="20%" stop-color="#D4CCFF" stop-opacity="0.3"/>
      <stop offset="50%" stop-color="#8B7FE8" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#4030A0" stop-opacity="0"/>
    </radialGradient>

    <!-- Filters -->
    <filter id="${id}-cg" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${18 * u}"/>
    </filter>
    <filter id="${id}-sg" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${8 * u}"/>
    </filter>
    <filter id="${id}-tg" x="-200%" y="-200%" width="500%" height="500%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${3 * u}"/>
    </filter>
  </defs>

  <g clip-path="url(#${id}-clip)">
    <!-- LAYER 1: Deep space background -->
    <rect width="${size}" height="${size}" fill="url(#${id}-bg)"/>

    <!-- LAYER 2: Nebula clouds -->
    <ellipse cx="${c * 0.7}" cy="${c * 0.8}" rx="${180 * u}" ry="${140 * u}" fill="url(#${id}-n1)"/>
    <ellipse cx="${c * 1.3}" cy="${c * 1.15}" rx="${160 * u}" ry="${120 * u}" fill="url(#${id}-n2)"/>
    <ellipse cx="${c * 1.1}" cy="${c * 0.7}" rx="${100 * u}" ry="${80 * u}" fill="url(#${id}-n3)"/>

    <!-- LAYER 3: Star field -->
${stars.map((s) => `    <circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="#fff" opacity="${s.o}"/>`).join("\n")}

    <!-- LAYER 4: Cosmic dust band -->
    <ellipse cx="${c}" cy="${c}" rx="${240 * u}" ry="${18 * u}" fill="#B4AAF0" fill-opacity="0.03" transform="rotate(-25 ${c} ${c})"/>
    <ellipse cx="${c}" cy="${c}" rx="${200 * u}" ry="${10 * u}" fill="#B4AAF0" fill-opacity="0.04" transform="rotate(-25 ${c} ${c})"/>

    <!-- LAYER 5: Outer aura -->
    <circle cx="${c}" cy="${c}" r="${200 * u}" fill="url(#${id}-au)"/>
    <circle cx="${c}" cy="${c * 1.04}" r="${140 * u}" fill="url(#${id}-aw)"/>

    <!-- LAYER 6: Diffused core glow -->
    <circle cx="${c}" cy="${c}" r="${90 * u}" fill="#9B8FFF" opacity="0.06" filter="url(#${id}-cg)"/>
    <circle cx="${c}" cy="${c}" r="${60 * u}" fill="#C8BFFF" opacity="0.1" filter="url(#${id}-sg)"/>

    <!-- LAYER 7: Rays -->
${rays.map((r) => `    ${r}`).join("\n")}

    <!-- LAYER 8: Lens flare -->
    <ellipse cx="${c}" cy="${c}" rx="${180 * u}" ry="${2.5 * u}" fill="#C8BFFF" fill-opacity="0.25"/>
    <ellipse cx="${c}" cy="${c}" rx="${120 * u}" ry="${1.5 * u}" fill="#FFFFFF" fill-opacity="0.35"/>
    <ellipse cx="${c}" cy="${c}" rx="${2.5 * u}" ry="${140 * u}" fill="#C8BFFF" fill-opacity="0.15"/>
    <ellipse cx="${c}" cy="${c}" rx="${1.5 * u}" ry="${90 * u}" fill="#FFFFFF" fill-opacity="0.2"/>
    <!-- Flare artifacts -->
    <circle cx="${c + 70 * u}" cy="${c}" r="${6 * u}" fill="#C8BFFF" fill-opacity="0.06"/>
    <circle cx="${c - 55 * u}" cy="${c}" r="${4 * u}" fill="#C8BFFF" fill-opacity="0.04"/>
    <circle cx="${c + 100 * u}" cy="${c}" r="${3 * u}" fill="#F0997B" fill-opacity="0.06"/>

    <!-- LAYER 9: Core -->
    <circle cx="${c}" cy="${c}" r="${56 * u}" fill="url(#${id}-co)"/>
    <circle cx="${c}" cy="${c}" r="${36 * u}" fill="url(#${id}-ci)" opacity="0.92"/>
    <circle cx="${c}" cy="${c}" r="${20 * u}" fill="url(#${id}-cw)"/>
    <circle cx="${c}" cy="${c}" r="${8 * u}" fill="#fff"/>
    <!-- Specular highlight -->
    <ellipse cx="${specCx}" cy="${specCy}" rx="${10 * u}" ry="${6 * u}" fill="#FFFFFF" fill-opacity="0.35" transform="rotate(-30 ${specCx} ${specCy})"/>

    <!-- LAYER 10: Companion stars -->
${companion(-95, -105, 4.5, "#F0997B", "#FFD4C4", 0.75)}
${companion(115, -78, 3.5, "#5DCAA5", "#B5F0D8", 0.6)}
${companion(85, 110, 4, "#F0997B", "#FFD4C4", 0.55)}
${companion(-105, 90, 3, "#5DCAA5", "#B5F0D8", 0.45)}

    <!-- LAYER 11: Sparkle dots with glow -->
${sparkles}

    <!-- LAYER 12: Central flare bloom -->
    <circle cx="${c}" cy="${c}" r="${32 * u}" fill="url(#${id}-fl)"/>
  </g>
</svg>`;

// ---------------------------------------------------------------------------
// 2. Generate PNGs and .icns
// ---------------------------------------------------------------------------

const buildDir = path.resolve("build");
const iconsetDir = path.join(buildDir, "Nova.iconset");

fs.mkdirSync(iconsetDir, { recursive: true });

// macOS iconset naming: base sizes and their @2x equivalents
const iconsetEntries = [
  { name: "icon_16x16.png", px: 16 },
  { name: "icon_16x16@2x.png", px: 32 },
  { name: "icon_32x32.png", px: 32 },
  { name: "icon_32x32@2x.png", px: 64 },
  { name: "icon_128x128.png", px: 128 },
  { name: "icon_128x128@2x.png", px: 256 },
  { name: "icon_256x256.png", px: 256 },
  { name: "icon_256x256@2x.png", px: 512 },
  { name: "icon_512x512.png", px: 512 },
  { name: "icon_512x512@2x.png", px: 1024 },
];

const svgBuffer = Buffer.from(svg);

async function main() {
  console.log("Generating icon PNGs...");

  // Deduplicate pixel sizes so we only render each once
  const uniqueSizes = [...new Set(iconsetEntries.map((e) => e.px))];
  const pngBuffers = new Map();

  await Promise.all(
    uniqueSizes.map(async (px) => {
      const buf = await sharp(svgBuffer)
        .resize(px, px)
        .png()
        .toBuffer();
      pngBuffers.set(px, buf);
    })
  );

  // Write iconset files
  for (const entry of iconsetEntries) {
    const dest = path.join(iconsetDir, entry.name);
    fs.writeFileSync(dest, pngBuffers.get(entry.px));
    console.log(`  ${entry.name} (${entry.px}px)`);
  }

  // Save 1024px PNG for Linux/Windows
  const icon1024Path = path.join(buildDir, "icon.png");
  fs.writeFileSync(icon1024Path, pngBuffers.get(1024));
  console.log(`  build/icon.png (1024px)`);

  // Build .icns via iconutil (macOS only)
  const icnsPath = path.join(buildDir, "icon.icns");
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, {
      stdio: "inherit",
    });
    console.log(`  build/icon.icns created`);
  } catch (err) {
    console.warn(
      "Warning: iconutil failed (only available on macOS).",
      err.message
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

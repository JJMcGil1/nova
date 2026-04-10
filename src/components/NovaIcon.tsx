/**
 * Nova App Icon
 *
 * Usage:
 *   <NovaIcon size={512} radius={112} />   // App Store
 *   <NovaIcon size={256} radius={56} />    // Desktop
 *   <NovaIcon size={128} radius={28} />    // Dock
 *   <NovaIcon size={64}  radius={14} />    // Toolbar
 *   <NovaIcon size={32}  radius={7} />     // Favicon
 *   <NovaIcon size={1024} radius={224} />  // Marketing
 *
 * To export as PNG:
 *   Render at 1024x1024, screenshot or use svg-to-png conversion.
 *   Or paste the raw SVG into Figma / Sketch for export.
 */

export default function NovaIcon({ size = 512, radius = 112 }) {
  const id = `nova-${size}`;
  const c = size / 2;
  const u = size / 512; // unit scale factor

  // Deterministic star field
  const stars = [];
  for (let i = 0; i < 35; i++) {
    stars.push({
      x: (Math.sin(i * 7.3 + 1.2) * 0.5 + 0.5) * size,
      y: (Math.cos(i * 5.1 + 3.4) * 0.5 + 0.5) * size,
      r: (0.3 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 1.2) * u,
      o: 0.15 + (Math.cos(i * 2.9) * 0.5 + 0.5) * 0.55,
    });
  }

  // Ray helper
  const ray = (angle: number, length: number, width: number, color: string, opacity: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return (
      <line
        key={`${angle}-${length}-${width}`}
        x1={c} y1={c}
        x2={c + Math.cos(rad) * length * u}
        y2={c + Math.sin(rad) * length * u}
        stroke={color}
        strokeWidth={width * u}
        strokeLinecap="round"
        opacity={opacity}
      />
    );
  };

  // Companion star with glow
  const companion = (cx: number, cy: number, r: number, color: string, lightColor: string, opacity: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx * u + c} cy={cy * u + c} r={r * 1.8 * u} fill={color} opacity={opacity * 0.1} filter={`url(#${id}-sg)`} />
      <circle cx={cx * u + c} cy={cy * u + c} r={r * u} fill={color} opacity={opacity} />
      <circle cx={cx * u + c} cy={cy * u + c} r={r * 0.45 * u} fill={lightColor} opacity={opacity * 1.2} />
    </g>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width={size} height={size} rx={radius} />
        </clipPath>

        {/* Background */}
        <radialGradient id={`${id}-bg`} cx="50%" cy="46%" r="75%">
          <stop offset="0%" stopColor="#1A1440" />
          <stop offset="35%" stopColor="#110D2A" />
          <stop offset="70%" stopColor="#0A0718" />
          <stop offset="100%" stopColor="#050310" />
        </radialGradient>

        {/* Nebula layers */}
        <radialGradient id={`${id}-n1`} cx="35%" cy="40%" r="45%">
          <stop offset="0%" stopColor="#7B3FA0" stopOpacity="0.18" />
          <stop offset="40%" stopColor="#5C2D91" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#2A1555" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-n2`} cx="65%" cy="60%" r="40%">
          <stop offset="0%" stopColor="#1B5E8A" stopOpacity="0.14" />
          <stop offset="50%" stopColor="#0D3A5C" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#071E30" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-n3`} cx="55%" cy="35%" r="30%">
          <stop offset="0%" stopColor="#C45528" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#6B2A10" stopOpacity="0" />
        </radialGradient>

        {/* Aura */}
        <radialGradient id={`${id}-au`} cx="50%" cy="50%" r="38%">
          <stop offset="0%" stopColor="#9B8FFF" stopOpacity="0.35" />
          <stop offset="30%" stopColor="#7B6FE0" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#5545B0" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#2A1F6B" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-aw`} cx="50%" cy="52%" r="28%">
          <stop offset="0%" stopColor="#E89070" stopOpacity="0.15" />
          <stop offset="60%" stopColor="#D06040" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#802010" stopOpacity="0" />
        </radialGradient>

        {/* Core layers */}
        <radialGradient id={`${id}-co`} cx="46%" cy="40%" r="52%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="15%" stopColor="#F5F2FF" />
          <stop offset="35%" stopColor="#D4CCFF" />
          <stop offset="60%" stopColor="#A89DEA" />
          <stop offset="100%" stopColor="#6B5FC0" />
        </radialGradient>
        <radialGradient id={`${id}-ci`} cx="44%" cy="38%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#F0EDFF" />
          <stop offset="100%" stopColor="#D8D2F8" />
        </radialGradient>
        <radialGradient id={`${id}-cw`} cx="42%" cy="36%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0EDFF" />
        </radialGradient>

        {/* Central flare */}
        <radialGradient id={`${id}-fl`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="20%" stopColor="#D4CCFF" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#8B7FE8" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#4030A0" stopOpacity="0" />
        </radialGradient>

        {/* Filters */}
        <filter id={`${id}-cg`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={18 * u} />
        </filter>
        <filter id={`${id}-sg`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={8 * u} />
        </filter>
        <filter id={`${id}-tg`} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={3 * u} />
        </filter>
      </defs>

      <g clipPath={`url(#${id}-clip)`}>
        {/* === LAYER 1: Deep space background === */}
        <rect width={size} height={size} fill={`url(#${id}-bg)`} />

        {/* === LAYER 2: Nebula clouds === */}
        <ellipse cx={c * 0.7} cy={c * 0.8} rx={180 * u} ry={140 * u} fill={`url(#${id}-n1)`} />
        <ellipse cx={c * 1.3} cy={c * 1.15} rx={160 * u} ry={120 * u} fill={`url(#${id}-n2)`} />
        <ellipse cx={c * 1.1} cy={c * 0.7} rx={100 * u} ry={80 * u} fill={`url(#${id}-n3)`} />

        {/* === LAYER 3: Star field === */}
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
        ))}

        {/* === LAYER 4: Cosmic dust band === */}
        <ellipse cx={c} cy={c} rx={240 * u} ry={18 * u} fill="rgba(180,170,240,0.03)" transform={`rotate(-25 ${c} ${c})`} />
        <ellipse cx={c} cy={c} rx={200 * u} ry={10 * u} fill="rgba(180,170,240,0.04)" transform={`rotate(-25 ${c} ${c})`} />

        {/* === LAYER 5: Outer aura === */}
        <circle cx={c} cy={c} r={200 * u} fill={`url(#${id}-au)`} />
        <circle cx={c} cy={c * 1.04} r={140 * u} fill={`url(#${id}-aw)`} />

        {/* === LAYER 6: Diffused core glow === */}
        <circle cx={c} cy={c} r={90 * u} fill="#9B8FFF" opacity="0.06" filter={`url(#${id}-cg)`} />
        <circle cx={c} cy={c} r={60 * u} fill="#C8BFFF" opacity="0.1" filter={`url(#${id}-sg)`} />

        {/* === LAYER 7: Rays === */}
        {/* Cardinal — wide + narrow overlay */}
        {[0, 90, 180, 270].map(a => ray(a, 210, 2.8, "#A89DEA", 0.4))}
        {[0, 90, 180, 270].map(a => ray(a, 210, 1.2, "#C8BFFF", 0.25))}
        {/* Diagonal */}
        {[45, 135, 225, 315].map(a => ray(a, 160, 1.8, "#B0A5F0", 0.28))}
        {[45, 135, 225, 315].map(a => ray(a, 160, 0.8, "#D4CCFF", 0.18))}
        {/* Tertiary */}
        {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map(a => ray(a, 110, 0.8, "#CECBF6", 0.15))}

        {/* === LAYER 8: Lens flare === */}
        <ellipse cx={c} cy={c} rx={180 * u} ry={2.5 * u} fill="rgba(200,191,255,0.25)" />
        <ellipse cx={c} cy={c} rx={120 * u} ry={1.5 * u} fill="rgba(255,255,255,0.35)" />
        <ellipse cx={c} cy={c} rx={2.5 * u} ry={140 * u} fill="rgba(200,191,255,0.15)" />
        <ellipse cx={c} cy={c} rx={1.5 * u} ry={90 * u} fill="rgba(255,255,255,0.2)" />
        {/* Flare artifacts */}
        <circle cx={c + 70 * u} cy={c} r={6 * u} fill="rgba(200,191,255,0.06)" />
        <circle cx={c - 55 * u} cy={c} r={4 * u} fill="rgba(200,191,255,0.04)" />
        <circle cx={c + 100 * u} cy={c} r={3 * u} fill="rgba(240,153,123,0.06)" />

        {/* === LAYER 9: Core === */}
        <circle cx={c} cy={c} r={56 * u} fill={`url(#${id}-co)`} />
        <circle cx={c} cy={c} r={36 * u} fill={`url(#${id}-ci)`} opacity="0.92" />
        <circle cx={c} cy={c} r={20 * u} fill={`url(#${id}-cw)`} />
        <circle cx={c} cy={c} r={8 * u} fill="#fff" />
        {/* Specular highlight */}
        <ellipse
          cx={c - 12 * u} cy={c - 14 * u}
          rx={10 * u} ry={6 * u}
          fill="rgba(255,255,255,0.35)"
          transform={`rotate(-30 ${c - 12 * u} ${c - 14 * u})`}
        />

        {/* === LAYER 10: Companion stars === */}
        {companion(-95, -105, 4.5, "#F0997B", "#FFD4C4", 0.75)}
        {companion(115, -78, 3.5, "#5DCAA5", "#B5F0D8", 0.6)}
        {companion(85, 110, 4, "#F0997B", "#FFD4C4", 0.55)}
        {companion(-105, 90, 3, "#5DCAA5", "#B5F0D8", 0.45)}

        {/* === LAYER 11: Sparkle dots with glow === */}
        {[
          [0.22, 0.18, 1.8, 0.5], [0.78, 0.22, 1.4, 0.4],
          [0.18, 0.72, 1.2, 0.35], [0.82, 0.75, 1.6, 0.45],
          [0.5, 0.12, 1, 0.3], [0.5, 0.88, 1.1, 0.3],
          [0.12, 0.45, 0.9, 0.25], [0.88, 0.5, 1, 0.3],
        ].map(([px, py, pr, po], i) => (
          <g key={`sparkle-${i}`}>
            <circle cx={px * size} cy={py * size} r={pr * u * 2} fill="#C8BFFF" opacity={po * 0.15} filter={`url(#${id}-tg)`} />
            <circle cx={px * size} cy={py * size} r={pr * u} fill="#E8E4FF" opacity={po} />
          </g>
        ))}

        {/* === LAYER 12: Central flare bloom === */}
        <circle cx={c} cy={c} r={32 * u} fill={`url(#${id}-fl)`} />
      </g>
    </svg>
  );
}

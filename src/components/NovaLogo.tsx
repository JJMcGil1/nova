function NovaGlyph({ size = 48, mode = "dark" }: { size?: number; mode?: "dark" | "light" }) {
  const id = `g${size}${mode}`;
  const c = size / 2;
  const u = size / 100;

  const dark = mode === "dark";
  const rayColor = dark ? "#B8B0F0" : "#8B7FE8";
  const rayFaint = dark ? "#D4CCFF" : "#9B8FFF";
  const rayThin = dark ? "rgba(200,191,255,0.35)" : "rgba(107,95,192,0.25)";
  const flareH = dark ? "rgba(200,191,255,0.3)" : "rgba(139,127,232,0.25)";
  const flareW = dark ? "rgba(255,255,255,0.4)" : "rgba(139,127,232,0.35)";
  const coreOuter = dark ? "#9B8FFF" : "#8B7FE8";
  const coreMid = dark ? "#C8BFFF" : "#A89DEA";
  const coreInner = dark ? "#E8E4FF" : "#D4CCFF";
  const coreCenter = dark ? "#FFFFFF" : "#FFFFFF";
  const coralDot = dark ? "#F0997B" : "#D85A30";
  const tealDot = dark ? "#5DCAA5" : "#1D9E75";
  const glowColor = dark ? "rgba(155,143,255,0.12)" : "rgba(139,127,232,0.1)";

  const ray = (angle: number, length: number, width: number, color: string, opacity: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return (
      <line key={`${angle}-${length}-${width}`}
        x1={c} y1={c}
        x2={c + Math.cos(rad) * length * u}
        y2={c + Math.sin(rad) * length * u}
        stroke={color} strokeWidth={width * u}
        strokeLinecap="round" opacity={opacity}
      />
    );
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`${id}-co`} cx="46%" cy="40%" r="52%">
          <stop offset="0%" stopColor={coreCenter}/>
          <stop offset="30%" stopColor={coreInner}/>
          <stop offset="60%" stopColor={coreMid}/>
          <stop offset="100%" stopColor={coreOuter}/>
        </radialGradient>
        <radialGradient id={`${id}-in`} cx="44%" cy="38%" r="50%">
          <stop offset="0%" stopColor={coreCenter}/>
          <stop offset="60%" stopColor={coreInner}/>
          <stop offset="100%" stopColor={coreMid}/>
        </radialGradient>
        <radialGradient id={`${id}-fl`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={coreCenter} stopOpacity="0.7"/>
          <stop offset="30%" stopColor={coreMid} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={coreOuter} stopOpacity="0"/>
        </radialGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={4 * u}/>
        </filter>
      </defs>

      {/* Ambient glow */}
      <circle cx={c} cy={c} r={38 * u} fill={glowColor} filter={`url(#${id}-glow)`}/>

      {/* Cardinal rays */}
      {[0, 90, 180, 270].map(a => ray(a, 46, 1.4, rayColor, 0.45))}
      {[0, 90, 180, 270].map(a => ray(a, 46, 0.6, rayFaint, 0.3))}

      {/* Diagonal rays */}
      {[45, 135, 225, 315].map(a => ray(a, 34, 1, rayColor, 0.3))}
      {[45, 135, 225, 315].map(a => ray(a, 34, 0.4, rayFaint, 0.2))}

      {/* Tertiary rays */}
      {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map(a => ray(a, 24, 0.5, rayThin, 0.5))}

      {/* Lens flare cross */}
      <ellipse cx={c} cy={c} rx={40 * u} ry={0.6 * u} fill={flareH}/>
      <ellipse cx={c} cy={c} rx={28 * u} ry={0.35 * u} fill={flareW}/>
      <ellipse cx={c} cy={c} rx={0.6 * u} ry={32 * u} fill={flareH} opacity="0.7"/>
      <ellipse cx={c} cy={c} rx={0.35 * u} ry={22 * u} fill={flareW} opacity="0.6"/>

      {/* Core */}
      <circle cx={c} cy={c} r={12 * u} fill={`url(#${id}-co)`}/>
      <circle cx={c} cy={c} r={7.5 * u} fill={`url(#${id}-in)`} opacity="0.9"/>
      <circle cx={c} cy={c} r={3.5 * u} fill={coreCenter}/>

      {/* Specular */}
      <ellipse cx={c - 2.5 * u} cy={c - 3 * u} rx={2.2 * u} ry={1.3 * u}
        fill="rgba(255,255,255,0.4)" transform={`rotate(-30 ${c - 2.5 * u} ${c - 3 * u})`}/>

      {/* Companion dots */}
      <circle cx={c - 20 * u} cy={c - 22 * u} r={1.8 * u} fill={coralDot} opacity="0.7"/>
      <circle cx={c + 24 * u} cy={c - 16 * u} r={1.4 * u} fill={tealDot} opacity="0.6"/>
      <circle cx={c + 18 * u} cy={c + 23 * u} r={1.6 * u} fill={coralDot} opacity="0.5"/>
      <circle cx={c - 22 * u} cy={c + 19 * u} r={1.2 * u} fill={tealDot} opacity="0.45"/>

      {/* Central bloom */}
      <circle cx={c} cy={c} r={7 * u} fill={`url(#${id}-fl)`}/>
    </svg>
  );
}

export default function NovaLogo({ mode = "dark", iconSize = 48, fontSize = 32, gap = 16 }: {
  mode?: "dark" | "light";
  iconSize?: number;
  fontSize?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap }}>
      <NovaGlyph size={iconSize} mode={mode} />
      <span style={{
        fontSize,
        fontWeight: 600,
        letterSpacing: 6,
        color: mode === "dark" ? "#FFFFFF" : "#1A1440",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
        lineHeight: 1,
      }}>NOVA</span>
    </div>
  );
}

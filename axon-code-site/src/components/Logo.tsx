import { useId } from "react";

/**
 * The Veylaro mark — twin V blades (ink + copper) with the four-point
 * copper star in the notch. Vector recreation of the brand logo,
 * transparent background, with optional entrance / pulse animation
 * (see .veylaro-mark styles).
 *
 * `ink` controls the left blade: defaults to warm ivory for dark
 * surfaces; pass "#2e2d31" (brand charcoal) on light surfaces.
 */
export function VeylaroMark({
  size = 40,
  animated = false,
  ink = "#f2ead9",
  className = "",
}: {
  size?: number;
  animated?: boolean;
  ink?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      className={`${animated ? "veylaro-mark" : ""} ${className}`}
      aria-label="Veylaro logo"
      role="img"
    >
      <defs>
        <linearGradient id={`cop-${id}`} x1="150" y1="52" x2="128" y2="192" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e7b487" />
          <stop offset="1" stopColor="#a96336" />
        </linearGradient>
        <linearGradient id={`star-${id}`} x1="120" y1="10" x2="120" y2="65" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ecc59b" />
          <stop offset="1" stopColor="#bd7846" />
        </linearGradient>
        <radialGradient id={`halo-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f0cfa4" stopOpacity="0.5" />
          <stop offset="1" stopColor="#f0cfa4" stopOpacity="0" />
        </radialGradient>
      </defs>
      {animated && <circle className="star-glow" cx="120" cy="42" r="52" fill={`url(#halo-${id})`} />}
      {/* left blade — ink */}
      <path
        className="blade-l"
        d="M 94 62 L 64 62 Q 52 62 55 74 L 106 184 Q 112 196 117 185 Q 106 122 94 62 Z"
        fill={ink}
      />
      {/* right blade — copper */}
      <path
        className="blade-r"
        d="M 146 62 L 176 62 Q 188 62 185 74 L 137 172 Q 131 184 126 173 Q 137 118 146 62 Z"
        fill={`url(#cop-${id})`}
      />
      {/* four-point star in the notch */}
      <path
        className="star"
        d="M 120 14 C 122.5 31 126 35 138 39 C 126 43 122.5 47 120 64 C 117.5 47 114 43 102 39 C 114 35 117.5 31 120 14 Z"
        fill={`url(#star-${id})`}
      />
    </svg>
  );
}

/** Mark + Veylaro wordmark lockup used in nav / footer. */
export function VeylaroLockup({ size = 30 }: { size?: number }) {
  return (
    <span className="nav-brand">
      <VeylaroMark size={size} />
      <span className="wordmark">Veylaro</span>
    </span>
  );
}

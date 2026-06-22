/** Inline SVG for the Neural Midi generate button (88×88, arcs only). */
export const NM_LOGO_SVG = `<svg viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="nmFace" cx="42%" cy="36%" r="62%" fx="38%" fy="32%">
      <stop offset="0%" stop-color="#4a6fad"/>
      <stop offset="38%" stop-color="#355691"/>
      <stop offset="100%" stop-color="#413f54"/>
    </radialGradient>
    <filter id="nmDrop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#30292f" flood-opacity="0.65"/>
    </filter>
  </defs>
  <circle cx="44" cy="44" r="42" fill="#30292f" opacity="0.55"/>
  <g filter="url(#nmDrop)">
    <circle cx="44" cy="44" r="39" fill="url(#nmFace)" stroke="#30292f" stroke-width="3.5"/>
  </g>
  <circle cx="44" cy="44" r="39" fill="none" stroke="rgba(180,195,230,0.12)" stroke-width="1"/>
  <circle cx="44" cy="44" r="30.5" fill="none" stroke="rgba(210,220,245,0.22)" stroke-width="0.75"/>
  <path d="M14 50 C24 26, 64 26, 74 50" stroke="rgba(255,255,255,0.16)" stroke-width="1.1" stroke-linecap="round" fill="none"/>
  <path d="M16 52 C26 30, 62 30, 72 52" stroke="rgba(255,255,255,0.28)" stroke-width="1.05" stroke-linecap="round" fill="none"/>
  <path d="M18 54 C28 34, 60 34, 70 54" stroke="rgba(255,255,255,0.40)" stroke-width="1" stroke-linecap="round" fill="none"/>
  <path d="M20 56 C30 38, 58 38, 68 56" stroke="rgba(255,255,255,0.54)" stroke-width="0.95" stroke-linecap="round" fill="none"/>
</svg>`;

export const NM_LOGO_MARKERS = [
  'id="nmFace"',
  'id="nmDrop"',
  'stroke-width="3.5"',
  '<path d="',
] as const;

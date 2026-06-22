/** Inline SVG for the Neural Midi generate button (88×88). */
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
  <path d="M16 48 C26 30, 38 24, 44 24 C50 24, 62 30, 72 48" stroke="rgba(255,255,255,0.18)" stroke-width="1.15" stroke-linecap="round" fill="none"/>
  <path d="M18 51 C28 35, 38 30, 44 30 C50 30, 60 35, 70 51" stroke="rgba(255,255,255,0.32)" stroke-width="1.05" stroke-linecap="round" fill="none"/>
  <path d="M20 54 C29 39, 38 35, 44 35 C50 35, 59 39, 68 54" stroke="rgba(255,255,255,0.48)" stroke-width="0.95" stroke-linecap="round" fill="none"/>
  <text x="44" y="53" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="21" font-weight="400" letter-spacing="3">NM</text>
</svg>`;

export const NM_LOGO_MARKERS = [
  'id="nmFace"',
  'id="nmDrop"',
  'letter-spacing="3">NM</text>',
  'stroke-width="3.5"',
] as const;

// Logos live in /public/logos. Matched to units by unit id (see Company settings).
export const LOGOS = {
  'amr-wheels': { color: '/logos/amr-wheels.png', white: '/logos/amr-wheels-white.png' },
  'amr-technofab': { color: '/logos/amr-technofab.png', white: '/logos/amr-technofab-white.png' },
};

export const MAIN_LOGO = LOGOS['amr-wheels'];

export const unitLogo = (unitId, variant = 'color') => LOGOS[unitId]?.[variant] || null;

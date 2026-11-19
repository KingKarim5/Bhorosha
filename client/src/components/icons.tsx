import { SVGProps } from 'react';

// Small line icons. No robots or brains (design brief).
const base = (p: SVGProps<SVGSVGElement>) => ({ width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 12.5l4.2 4.2L19 7" /></svg>);
export const IconSpeech = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 5h14v10H9l-4 4z" /></svg>);
export const IconLeaf = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 19l7-7" /></svg>);
export const IconQuestion = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.6-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></svg>);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>);
export const IconAlert = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>);
export const IconHome = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 11l8-7 8 7v9H4z" /></svg>);
export const IconFolder = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 7h6l2 2h10v10H3z" /></svg>);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconPulse = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>);
export const IconScale = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 4v16M6 20h12M5 8h14M5 8l-2 6h4zM19 8l-2 6h4z" /></svg>);
export const IconGauge = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 16a8 8 0 1116 0" /><path d="M12 16l4-5" /></svg>);
export const IconSliders = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>);
export const IconShadow = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="4" y="4" width="12" height="12" rx="2" /><path d="M8 20h12V8" /></svg>);
export const IconHand = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 15c3 0 4-2 7-2h5a2 2 0 010 4h-4" /><path d="M3 19h11l6-5" /><circle cx="15" cy="7" r="3" /></svg>);
export const IconFlow = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 12h3M14 12h3" /></svg>);
export const IconInfo = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const IconSun = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const IconMoon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" /></svg>);
export const IconPrint = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" /><rect x="7" y="14" width="10" height="7" /></svg>);
export const IconVolume = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" /></svg>);
export const IconDoc = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>);
export const IconLogout = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>);
export const IconLayers = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>);

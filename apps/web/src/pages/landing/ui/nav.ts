export const NAV = [
  { href: '#story', key: 'landing.navStory' },
  { href: '#flow', key: 'landing.navFlow' },
  { href: '#dashboard', key: 'landing.navDashboard' },
  { href: '#features', key: 'landing.navFeatures' },
  { href: '#specs', key: 'landing.navSpecs' },
  { href: '#faq', key: 'landing.navFaq' },
] as const;

/** LocaleSwitch overrides for the dark landing surfaces. */
export const DARK_SWITCH =
  'bg-white/10 [&>button]:h-7 [&>button]:text-[#d2d2d7] [&>button]:max-md:h-8 [&>button:hover]:text-white';

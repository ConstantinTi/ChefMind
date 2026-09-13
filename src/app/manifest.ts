import type { MetadataRoute } from 'next';

/** Makes ChefMind installable on a phone or tablet for use in the kitchen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChefMind — Rezepte',
    short_name: 'ChefMind',
    description: 'Private Rezeptverwaltung mit Portionsrechner, Wochenplan und Einkaufsliste.',
    start_url: '/',
    display: 'standalone',
    // No orientation lock: a tablet propped up in landscape is a normal way to
    // cook, and locking to portrait just rotates the recipe away from the cook.
    background_color: '#fbf9f5',
    theme_color: '#b4541f',
    categories: ['food', 'lifestyle', 'productivity'],
    lang: 'de',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Without a maskable icon Android draws the whole square on a white plate.
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Einkaufsliste', url: '/einkaufsliste' },
      { name: 'Wochenplan', url: '/plan' },
      { name: 'Rezept importieren', url: '/import' },
    ],
  };
}

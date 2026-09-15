import type { NextConfig } from 'next';
import { PROXY_BODY_LIMIT, SERVER_ACTION_BODY_LIMIT } from './src/lib/upload-limits';

const nextConfig: NextConfig = {
  // Produces .next/standalone — a self-contained server bundle for the Docker image.
  output: 'standalone',

  // better-sqlite3 and sharp are native modules. Without this webpack tries to
  // bundle them and you get "Cannot find module" at runtime, in the container
  // only, in production only. Do not remove.
  serverExternalPackages: ['better-sqlite3', 'sharp'],

  // We generate exactly two image sizes ourselves at upload time, so Next's
  // optimizer would only add weight to the runtime.
  images: { unoptimized: true },

  experimental: {
    serverActions: {
      // Fotos werden über einen Server Action hochgeladen, und der Body ist
      // ohne diese Zeile auf 1 MB begrenzt — weniger als ein Handyfoto. Jedes
      // Bild scheiterte daran mit "Minified React error #441", weil Next den
      // 413 als Server-Fehler an die Error Boundary weiterreicht und die echte
      // Meldung in Produktion verschluckt. Do not remove.
      bodySizeLimit: SERVER_ACTION_BODY_LIMIT,
    },

    // Zweite, unabhängige Grenze — und die greift zuerst. Weil `src/proxy.ts`
    // existiert, klont Next jeden Request-Body zum Zwischenspeichern und
    // deckelt das hier; der Standard sind 10 MB. Darüber schlägt der Request
    // NICHT fehl, die Route bekommt einen abgeschnittenen Body. Ohne diese
    // Zeile nützt das großzügige bodySizeLimit oben also nichts. Do not remove.
    proxyClientMaxBodySize: PROXY_BODY_LIMIT,
  },
};

export default nextConfig;

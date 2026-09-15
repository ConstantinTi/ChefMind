/**
 * Wie schwer ein Foto-Upload sein darf.
 *
 * Fotos gehen über einen Server Action, und dessen Request-Body ist bei Next
 * standardmäßig auf 1 MB begrenzt — ein einzelnes Handyfoto wiegt 2–6 MB. Jeder
 * Upload scheiterte deshalb an einer Grenze, die mit Fotos nichts zu tun hat,
 * und zwar mit einem minifizierten React-Fehler statt einer Meldung.
 *
 * Die Zahlen stehen hier, weil drei Stellen sie brauchen, die einander nicht
 * importieren können: `next.config.ts` (kennt das `@/`-Alias nicht), der Server
 * Action und das Formular im Browser. Diese Datei hat deshalb bewusst keine
 * Importe — weder `sharp` noch `node:fs` dürfen im Client landen.
 */

const MB = 1024 * 1024;

/** Pro Bild. Deckt auch eine Spiegelreflex-JPEG ab; `sharp` rechnet ohnehin auf webp herunter. */
export const MAX_PHOTO_BYTES = 25 * MB;

/** Pro Upload — mehrere Bilder reisen in einem einzigen Request. */
export const MAX_UPLOAD_BYTES = 50 * MB;

/**
 * Was Next durchlässt. Absichtlich über `MAX_UPLOAD_BYTES`: Multipart-Grenzen
 * und Part-Header kommen obendrauf, und zuerst greifen soll die Prüfung im
 * Formular — sie ist die einzige, die erklären kann, was zu tun ist.
 */
export const SERVER_ACTION_BODY_LIMIT: `${number}mb` = `${MAX_UPLOAD_BYTES / MB + 2}mb`;

/**
 * Wie viel Body Next überhaupt puffert — und damit die Grenze, die als erste
 * greift.
 *
 * Sobald `src/proxy.ts` existiert, klont Next jeden Request-Body, damit er
 * zweimal gelesen werden kann, und begrenzt das hier (Standard 10 MB). Darüber
 * schlägt der Request nicht fehl: die Route bekommt einen **abgeschnittenen**
 * Body, und `request.formData()` stirbt mit „Failed to parse body as FormData".
 * Diese Grenze gilt für Server Actions und Route Handler gleichermaßen, also
 * nützt ein großzügiges `SERVER_ACTION_BODY_LIMIT` ohne sie nichts.
 */
export const PROXY_BODY_LIMIT = MAX_UPLOAD_BYTES + 2 * MB;

/** "4,4 MB" — für Meldungen, die eine Zahl nennen müssen, damit sie hilft. */
export function formatBytes(bytes: number): string {
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { clientAddressFromHeaders, envHostList, isAllowedHost, isPrivateAddress } from '@/lib/network';

/**
 * The front door.
 *
 * ChefMind has no login, so this is the access control. It runs on every
 * request, before any route, and enforces two independent things — see
 * `src/lib/network.ts` for why both are needed and what each one stops.
 *
 * Note on trust: the client address comes from `x-forwarded-for`, which Next's
 * Node server fills in from the socket but which a client can also send itself.
 * So this stops a stray port forward, a scanner, and anything that wanders in
 * by accident — it is NOT a boundary against someone who can already reach the
 * port and knows to forge the header. The real boundary is which interface the
 * container publishes on; see docker-compose.yml.
 *
 * In Next 16 this file is `proxy.ts`, not `middleware.ts`, and it runs on the
 * Node.js runtime by default.
 */

const EXTRA_HOSTS = envHostList(process.env.CHEFMIND_ALLOWED_HOSTS);
/** Escape hatch for putting ChefMind behind a reverse proxy that authenticates. */
const ALLOW_PUBLIC = process.env.CHEFMIND_ALLOW_PUBLIC_ACCESS === '1';

function forbidden(reason: string, detail: string): NextResponse {
  return new NextResponse(`${reason}\n\n${detail}\n`, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export function proxy(request: NextRequest) {
  const address = clientAddressFromHeaders(request.headers);

  // An unknown address is allowed through. Failing closed here would take the
  // whole app down on any setup that strips the header, with a 403 that gives
  // no hint why — and the network is the real boundary regardless.
  if (!ALLOW_PUBLIC && address && !isPrivateAddress(address)) {
    return forbidden(
      'ChefMind ist nur aus dem privaten Netz erreichbar.',
      `Deine Adresse (${address}) liegt außerhalb der privaten Bereiche.\n`
      + 'Erlaubt sind LAN (10.x, 172.16–31.x, 192.168.x), Loopback, Link-local,\n'
      + 'Tailscale (100.64–127.x und fd7a::/48) sowie IPv6 ULA (fc00::/7).\n\n'
      + 'Wenn das Absicht ist, setze CHEFMIND_ALLOW_PUBLIC_ACCESS=1 — aber bitte\n'
      + 'nur hinter einem Reverse Proxy, der selbst authentifiziert. Es gibt kein Login.',
    );
  }

  const host = request.headers.get('host');
  if (!isAllowedHost(host, EXTRA_HOSTS)) {
    return forbidden(
      'Unerwarteter Host-Header.',
      `Diese Anfrage kam unter dem Namen "${host ?? '(keiner)'}" an, und der gehört\n`
      + 'nicht zu diesem Server. Das ist der Schutz gegen DNS-Rebinding: sonst könnte\n'
      + 'eine fremde Webseite ihren eigenen Namen auf diese Adresse auflösen und über\n'
      + 'deinen Browser die MCP-Tools aufrufen.\n\n'
      + 'Ohne Konfiguration akzeptiert werden: private IP-Adressen, localhost,\n'
      + 'Hostnamen ohne Punkt sowie .local, .lan, .internal, .home.arpa und .ts.net.\n\n'
      + 'Eigene Domain? Dann ergänze sie in CHEFMIND_ALLOWED_HOSTS.',
    );
  }

  return NextResponse.next();
}

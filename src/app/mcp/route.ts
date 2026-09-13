import { createMcpHandler } from '@modelcontextprotocol/server';
import { createChefMindMcpServer } from '@/mcp/server';
import { envHostList, isAllowedHost, isAllowedOrigin } from '@/lib/network';

// better-sqlite3 and sharp are native modules — they cannot run on the edge runtime.
export const runtime = 'nodejs';
// Without this Next may try to prerender or cache the GET, which breaks the protocol.
export const dynamic = 'force-dynamic';

// Optional additions to the zero-config rule in src/lib/network.ts — only
// needed for a real domain name, which that rule cannot tell from an
// attacker's. Everything private is accepted without listing it.
const EXTRA_HOSTS = envHostList(process.env.CHEFMIND_ALLOWED_HOSTS);
const READ_ONLY = process.env.CHEFMIND_MCP_READONLY === '1';
const TOKEN = process.env.CHEFMIND_MCP_TOKEN?.trim();

/**
 * The MCP endpoint.
 *
 * SDK v2's handler is already `(Request) => Promise<Response>`, which is exactly
 * the App Router route-handler contract — so MCP lives in the same process, on
 * the same port, over the same SQLite handle as the web UI.
 *
 * `responseMode: 'json'` switches off streaming entirely. Nothing here is slow
 * enough to need progress notifications (the heaviest call aggregates a week of
 * recipes against local SQLite, in single-digit milliseconds), and buffered JSON
 * responses sidestep the whole class of SSE/proxy-buffering problems.
 */
const handler = createMcpHandler(
  () => createChefMindMcpServer({ readOnly: READ_ONLY }),
  {
    responseMode: 'json',
    legacy: 'stateless',
    onerror: (error) => console.error('[chefmind:mcp]', error),
  },
);

function rebindingBlocked(what: string, value: string | null): Response {
  return new Response(
    JSON.stringify({
      error: `Unerwarteter ${what}: ${value ?? '(keiner)'}. `
        + 'Schutz gegen DNS-Rebinding — eigene Domains gehören in CHEFMIND_ALLOWED_HOSTS.',
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  );
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: 'Ungültiges oder fehlendes Bearer-Token.' }),
    { status: 401, headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' } },
  );
}

async function route(request: Request): Promise<Response> {
  // DNS-rebinding protection. This endpoint has no login and exposes
  // delete_recipe, so without these checks any web page you happen to visit
  // could resolve its own hostname to this server and start issuing calls.
  //
  // src/proxy.ts already applies the same rule to every request. It is repeated
  // here on purpose: this route must stay safe on its own, because the whole
  // point of keeping src/mcp free of next/* is that it can be lifted out into a
  // plain node:http process, where no proxy would run.
  const host = request.headers.get('host');
  if (!isAllowedHost(host, EXTRA_HOSTS)) return rebindingBlocked('Host', host);

  // Non-browser clients send no Origin at all; only a present one is judged.
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, EXTRA_HOSTS)) return rebindingBlocked('Origin', origin);

  // Optional shared secret — off by default, as requested. Set CHEFMIND_MCP_TOKEN
  // if this ever becomes reachable from outside your LAN or VPN.
  if (TOKEN && request.headers.get('authorization') !== `Bearer ${TOKEN}`) {
    return unauthorized();
  }

  return handler.fetch(request);
}

export { route as GET, route as POST, route as DELETE };

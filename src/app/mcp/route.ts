import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import { createChefMindMcpServer } from '@/mcp/server';

// better-sqlite3 and sharp are native modules — they cannot run on the edge runtime.
export const runtime = 'nodejs';
// Without this Next may try to prerender or cache the GET, which breaks the protocol.
export const dynamic = 'force-dynamic';

const envList = (value: string | undefined, fallback: string[]) =>
  value?.split(',').map((s) => s.trim()).filter(Boolean) ?? fallback;

// Hostnames only — no ports. The validator strips the port from the Host header
// before comparing, so "localhost:3000" here would never match anything.
const ALLOWED_HOSTS = envList(process.env.CHEFMIND_ALLOWED_HOSTS, ['localhost', '127.0.0.1', '[::1]']);
const ALLOWED_ORIGINS = envList(process.env.CHEFMIND_ALLOWED_ORIGINS, ['localhost', '127.0.0.1', '[::1]']);
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
  const blocked =
    hostHeaderValidationResponse(request, ALLOWED_HOSTS)
    ?? originValidationResponse(request, ALLOWED_ORIGINS);
  if (blocked) return blocked;

  // Optional shared secret — off by default, as requested. Set CHEFMIND_MCP_TOKEN
  // if this ever becomes reachable from outside your LAN or VPN.
  if (TOKEN && request.headers.get('authorization') !== `Bearer ${TOKEN}`) {
    return unauthorized();
  }

  return handler.fetch(request);
}

export { route as GET, route as POST, route as DELETE };

/**
 * Who is allowed to talk to this app.
 *
 * ChefMind has no login by design, so the question "is this request from my own
 * network?" is the only access control there is. Two separate things are checked
 * and they defend against different attacks:
 *
 *   isPrivateAddress()  — where the request came from. Stops the app answering
 *                         at all if the port ever ends up exposed to the
 *                         internet by a stray port forward.
 *
 *   isAllowedHost()     — which name the request used to get here. Stops DNS
 *                         rebinding, where a page you visit re-points its own
 *                         domain at your private IP and then drives the MCP
 *                         tools from inside your browser. That request comes
 *                         FROM your own machine, so the address check cannot
 *                         see it; only the Host header gives it away.
 *
 * Both are deliberately zero-configuration: every private range is accepted,
 * including Tailscale's, so nothing has to be enumerated per deployment.
 */

// ── IPv4 ─────────────────────────────────────────────────────────────────────

/** Strict dotted quad. Leading zeros are rejected rather than read as octal. */
export function parseIPv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function isPrivateIPv4([a, b]: number[]): boolean {
  if (a === undefined || b === undefined) return false;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                         // loopback
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 169 && b === 254) return true;            // link-local
  // 100.64.0.0/10, the carrier-grade NAT range Tailscale hands out.
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

// ── IPv6 ─────────────────────────────────────────────────────────────────────

/** Expands any valid textual IPv6 address to its eight 16-bit groups. */
export function parseIPv6(value: string): number[] | null {
  if (!value.includes(':')) return null;
  const shortenings = value.split('::').length - 1;
  if (shortenings > 1) return null;

  let rest = value;
  let embedded: number[] = [];

  // A trailing dotted quad, as in ::ffff:192.168.1.5.
  const lastColon = rest.lastIndexOf(':');
  const tailSegment = rest.slice(lastColon + 1);
  if (tailSegment.includes('.')) {
    const octets = parseIPv4(tailSegment);
    if (!octets) return null;
    embedded = [(octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!];
    rest = rest.slice(0, lastColon);
  }

  const [headRaw, tailRaw] = shortenings === 1 ? rest.split('::') : [rest, undefined];

  const groups = (segment: string | undefined): number[] | null => {
    if (!segment) return [];
    const out: number[] = [];
    for (const g of segment.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = groups(headRaw);
  const tail = groups(tailRaw);
  if (head === null || tail === null) return null;

  const present = head.length + tail.length + embedded.length;
  if (shortenings === 0) {
    return present === 8 ? [...head, ...tail, ...embedded] : null;
  }
  if (present > 7) return null;
  return [...head, ...Array(8 - present).fill(0), ...tail, ...embedded];
}

function isPrivateIPv6(h: number[]): boolean {
  if (h.length !== 8) return false;
  // ::1
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true;
  // ::ffff:a.b.c.d — an IPv4 address wearing an IPv6 coat.
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return isPrivateIPv4([h[6]! >> 8, h[6]! & 0xff, h[7]! >> 8, h[7]! & 0xff]);
  }
  if ((h[0]! & 0xfe00) === 0xfc00) return true;   // fc00::/7, unique local — Tailscale's IPv6 lives here
  if ((h[0]! & 0xffc0) === 0xfe80) return true;   // fe80::/10, link-local
  return false;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Strips brackets, a zone index, and an accidental :port from an address. */
export function normalizeAddress(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close !== -1) value = value.slice(1, close);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    // Some proxies append the source port to an IPv4 address.
    value = value.slice(0, value.lastIndexOf(':'));
  }
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  return value;
}

export function isPrivateAddress(raw: string): boolean {
  const value = normalizeAddress(raw);
  if (!value) return false;
  const v4 = parseIPv4(value);
  if (v4) return isPrivateIPv4(v4);
  const v6 = parseIPv6(value);
  if (v6) return isPrivateIPv6(v6);
  return false;
}

/**
 * The client address, as far as it can be known.
 *
 * Read from `x-forwarded-for`. How much that is worth depends entirely on what
 * sits in front:
 *
 *   - As deployed, nothing reaches the app except through Caddy or
 *     `tailscale serve`, and both overwrite this header with the real peer
 *     address. Then it is trustworthy.
 *   - Running the app's own port directly, Next fills the header in from the
 *     socket only when the client did not send one. A client that sends its
 *     own is believed. Then this is a guard rail, not a boundary.
 *
 * Either way the first entry is the original client, which is what matters.
 */
export function clientAddressFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return normalizeAddress(first);
  const real = headers.get('x-real-ip')?.trim();
  return real ? normalizeAddress(real) : null;
}

/** Host header minus its port, lowercased. Handles `[::1]:3000`. */
export function hostnameFromHeader(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    return close === -1 ? value : value.slice(1, close);
  }
  const colon = value.indexOf(':');
  return colon === -1 ? value : value.slice(0, colon);
}

/**
 * Suffixes that cannot be registered on the public internet, so an attacker
 * cannot point one of them at your machine.
 */
const PRIVATE_SUFFIXES = [
  '.local',      // mDNS / Bonjour
  '.internal',
  '.lan',
  '.home.arpa',  // RFC 8375, the officially reserved home network name
  '.ts.net',     // Tailscale MagicDNS
];

/**
 * Is it safe to answer a request that arrived under this name?
 *
 * Accepts anything that cannot be an attacker-controlled public domain: private
 * IP literals, single-label hostnames, and the reserved suffixes above. That
 * covers every realistic private setup without configuration, which is the
 * point — an allowlist you have to maintain per deployment is one you will
 * eventually widen to `*` to make a deploy go through.
 */
export function isAllowedHost(host: string | null, extra: readonly string[] = []): boolean {
  if (!host) return false;
  const name = hostnameFromHeader(host);
  if (!name) return false;

  if (extra.some((e) => e.trim().toLowerCase() === name)) return true;
  if (name === 'localhost') return true;
  if (isPrivateAddress(name)) return true;
  // A name with no dot cannot be resolved from outside the local network.
  if (!name.includes('.')) return true;
  return PRIVATE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/** Same rule, applied to an `Origin` header. A malformed origin is refused. */
export function isAllowedOrigin(origin: string | null, extra: readonly string[] = []): boolean {
  if (!origin) return false;
  try {
    return isAllowedHost(new URL(origin).host, extra);
  } catch {
    // Includes the literal "null" origin a sandboxed iframe sends.
    return false;
  }
}

/** Comma-separated env var -> trimmed list. */
export function envHostList(value: string | undefined): string[] {
  return value?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
}

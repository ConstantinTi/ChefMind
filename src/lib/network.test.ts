import { describe, expect, it } from 'vitest';
import {
  clientAddressFromHeaders, hostnameFromHeader, isAllowedHost, isPrivateAddress,
  normalizeAddress, parseIPv4, parseIPv6,
} from './network';

describe('parseIPv4', () => {
  it('accepts a dotted quad', () => {
    expect(parseIPv4('192.168.1.5')).toEqual([192, 168, 1, 5]);
    expect(parseIPv4('0.0.0.0')).toEqual([0, 0, 0, 0]);
    expect(parseIPv4('255.255.255.255')).toEqual([255, 255, 255, 255]);
  });

  it('rejects out-of-range and malformed input', () => {
    expect(parseIPv4('256.1.1.1')).toBeNull();
    expect(parseIPv4('1.2.3')).toBeNull();
    expect(parseIPv4('1.2.3.4.5')).toBeNull();
    expect(parseIPv4('a.b.c.d')).toBeNull();
  });

  it('rejects leading zeros rather than reading them as octal', () => {
    // 010.0.0.1 is 8.0.0.1 to some parsers and 10.0.0.1 to others. Refuse it.
    expect(parseIPv4('010.0.0.1')).toBeNull();
  });
});

describe('parseIPv6', () => {
  it('expands a shortened address', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('expands a full address', () => {
    expect(parseIPv6('fd7a:115c:a1e0:ab12:4843:cd96:6250:1a2b'))
      .toEqual([0xfd7a, 0x115c, 0xa1e0, 0xab12, 0x4843, 0xcd96, 0x6250, 0x1a2b]);
  });

  it('handles an embedded IPv4 address', () => {
    expect(parseIPv6('::ffff:192.168.1.5'))
      .toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0105]);
    expect(parseIPv6('0:0:0:0:0:ffff:192.168.1.5'))
      .toEqual([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0105]);
  });

  it('rejects malformed input', () => {
    expect(parseIPv6('1::2::3')).toBeNull();
    expect(parseIPv6('gggg::1')).toBeNull();
    expect(parseIPv6('192.168.1.5')).toBeNull();
    // Too few groups without a shortening.
    expect(parseIPv6('1:2:3:4:5:6:7')).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  it('accepts every private IPv4 range', () => {
    for (const ip of [
      '10.0.0.1', '10.255.255.254',
      '172.16.0.1', '172.31.255.254',
      '192.168.1.250',
      '127.0.0.1',
      '169.254.1.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('accepts the Tailscale CGNAT range', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('100.101.102.103')).toBe(true);
    expect(isPrivateAddress('100.127.255.254')).toBe(true);
  });

  it('rejects public addresses that sit just outside those ranges', () => {
    for (const ip of [
      '8.8.8.8', '1.1.1.1',
      '172.15.0.1', '172.32.0.1',   // either side of 172.16.0.0/12
      '192.167.1.1', '192.169.1.1', // either side of 192.168.0.0/16
      '100.63.255.255', '100.128.0.1', // either side of 100.64.0.0/10
      '11.0.0.1', '9.255.255.255',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('accepts private IPv6, including Tailscale ULA', () => {
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fd7a:115c:a1e0::1')).toBe(true);  // Tailscale
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fdff::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });

  it('rejects public IPv6', () => {
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
    expect(isPrivateAddress('fec0::1')).toBe(false);  // site-local, deprecated
    expect(isPrivateAddress('::')).toBe(false);
  });

  it('sees through an IPv4-mapped IPv6 address', () => {
    expect(isPrivateAddress('::ffff:192.168.1.5')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('handles brackets, zones and stray ports', () => {
    expect(isPrivateAddress('[::1]')).toBe(true);
    expect(isPrivateAddress('fe80::1%eth0')).toBe(true);
    expect(isPrivateAddress('192.168.1.5:54321')).toBe(true);
  });

  it('rejects nonsense rather than failing open', () => {
    expect(isPrivateAddress('')).toBe(false);
    expect(isPrivateAddress('not-an-ip')).toBe(false);
    expect(isPrivateAddress('192.168.1')).toBe(false);
  });
});

describe('normalizeAddress', () => {
  it('leaves a bare address alone', () => {
    expect(normalizeAddress(' 10.0.0.1 ')).toBe('10.0.0.1');
  });

  it('does not mistake IPv6 colons for a port', () => {
    expect(normalizeAddress('fd7a::1')).toBe('fd7a::1');
  });
});

describe('clientAddressFromHeaders', () => {
  it('takes the first entry, which is the original client', () => {
    const headers = new Headers({ 'x-forwarded-for': '192.168.1.5, 10.0.0.1, 10.0.0.2' });
    expect(clientAddressFromHeaders(headers)).toBe('192.168.1.5');
  });

  it('falls back to x-real-ip', () => {
    expect(clientAddressFromHeaders(new Headers({ 'x-real-ip': '10.1.2.3' }))).toBe('10.1.2.3');
  });

  it('returns nothing when the address cannot be known', () => {
    expect(clientAddressFromHeaders(new Headers())).toBeNull();
  });
});

describe('hostnameFromHeader', () => {
  it('drops the port', () => {
    expect(hostnameFromHeader('chefmind.local:3000')).toBe('chefmind.local');
    expect(hostnameFromHeader('192.168.1.250:3000')).toBe('192.168.1.250');
  });

  it('unwraps a bracketed IPv6 host', () => {
    expect(hostnameFromHeader('[::1]:3000')).toBe('::1');
    expect(hostnameFromHeader('[fd7a::1]')).toBe('fd7a::1');
  });
});

describe('isAllowedHost', () => {
  it('accepts the ways you actually reach a machine on your own network', () => {
    for (const host of [
      'localhost:3000',
      '127.0.0.1:3000',
      '[::1]:3000',
      '192.168.1.250:3000',
      '100.101.102.103:3000',         // Tailscale
      '[fd7a:115c:a1e0::1]:3000',     // Tailscale IPv6
      'chefmind',                      // single label
      'chefmind.local',
      'fw-coti.tail1a2b.ts.net',       // Tailscale MagicDNS
      'chefmind.home.arpa',
    ]) {
      expect(isAllowedHost(host), host).toBe(true);
    }
  });

  /** This is the DNS-rebinding case, and the whole reason the check exists. */
  it('rejects a public domain pointed at a private address', () => {
    expect(isAllowedHost('evil.com')).toBe(false);
    expect(isAllowedHost('evil.com:3000')).toBe(false);
    expect(isAllowedHost('chefmind.evil.com')).toBe(false);
    // A public address as the host is equally not ours.
    expect(isAllowedHost('8.8.8.8')).toBe(false);
  });

  it('is not fooled by a lookalike suffix', () => {
    expect(isAllowedHost('notlocal')).toBe(true);        // single label, fine
    expect(isAllowedHost('evil.com.br')).toBe(false);
    expect(isAllowedHost('local.evil.com')).toBe(false);
  });

  it('accepts an explicitly configured extra host', () => {
    expect(isAllowedHost('kueche.example.com', ['kueche.example.com'])).toBe(true);
    expect(isAllowedHost('kueche.example.com', ['andere.example.com'])).toBe(false);
  });

  it('rejects a missing host header', () => {
    expect(isAllowedHost(null)).toBe(false);
    expect(isAllowedHost('')).toBe(false);
  });
});

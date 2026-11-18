// Checks the address every outgoing connection of the self-hosted server really goes to.
//
// functions/_shared/fetchExternal.ts refuses private addresses by looking at the name in the link.
// On Cloudflare that's enough: a Worker can't reach a home network. A self-hosted server can, and
// any public name can point at a private address (127.0.0.1.nip.io resolves to 127.0.0.1). So here
// the name is resolved first, every address it resolves to is checked, and the connection is made to
// those checked addresses only, which also stops a name that changes its answer between the check
// and the connection.

import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { BLOCKED_ADDRESS_CODE, setGuardedFetch } from '../functions/_shared/fetchExternal';

// Never reachable: "this network", loopback, link-local (including cloud metadata at
// 169.254.169.254), protocol assignments, documentation, benchmarking, multicast and reserved
const alwaysBlocked = new net.BlockList();
for (const [range, bits] of [
  ['0.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  alwaysBlocked.addSubnet(range, bits, 'ipv4');
}
for (const [range, bits] of [
  ['::', 128], ['::1', 128], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
  // NAT64 and 6to4 can carry an IPv4 address inside, including private ones
  ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2002::', 16],
] as const) {
  alwaysBlocked.addSubnet(range, bits, 'ipv6');
}

// Home and office networks, carrier-grade NAT (Tailscale) and unique-local IPv6: allowed only for
// calendar and RSS feeds when AMBIENTLY_ALLOW_PRIVATE_FEEDS=true
const homeNetwork = new net.BlockList();
for (const [range, bits] of [['10.0.0.0', 8], ['100.64.0.0', 10], ['172.16.0.0', 12], ['192.168.0.0', 16]] as const) {
  homeNetwork.addSubnet(range, bits, 'ipv4');
}
homeNetwork.addSubnet('fc00::', 7, 'ipv6');
homeNetwork.addSubnet('fec0::', 10, 'ipv6');

/** The IPv4 address inside an IPv4-mapped IPv6 address (::ffff:127.0.0.1 or ::ffff:7f00:1), if it is one. */
function mappedIpv4(address: string): string | null {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

export function isBlockedAddress(address: string, allowHomeNetwork: boolean): boolean {
  const v4 = mappedIpv4(address);
  const ip = v4 ?? address;
  const family = net.isIP(ip);
  if (family === 0) return true;
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (alwaysBlocked.check(ip, type)) return true;
  return !allowHomeNetwork && homeNetwork.check(ip, type);
}

function guardedLookup(allowHomeNetwork: boolean): net.LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const blocked = addresses.find((a) => isBlockedAddress(a.address, allowHomeNetwork));
      if (blocked || addresses.length === 0) {
        const refusal = new Error(`${hostname} points at an address that isn't allowed.`) as NodeJS.ErrnoException;
        refusal.code = BLOCKED_ADDRESS_CODE;
        return callback(refusal, '', 0);
      }
      if ((options as dns.LookupOptions).all) return (callback as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function guardedFetch(allowHomeNetwork: boolean) {
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(allowHomeNetwork) } });
  return (url: string, init: RequestInit) =>
    undiciFetch(url, { ...(init as Record<string, unknown>), dispatcher } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
}

/** Makes every fetchExternal call in this process check resolved addresses. */
export function installAddressGuard(): void {
  setGuardedFetch({ publicOnly: guardedFetch(false), privateAllowed: guardedFetch(true) });
}

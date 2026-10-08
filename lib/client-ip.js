'use strict';

/* The address of the person at the other end, as far as it can be trusted.

   The first X-Forwarded-For entry is whatever the client wrote in the
   header, so a brake keyed on it is walked straight past by rotating it
   (review B item 7, 8 Oct 2026). Each proxy APPENDS the address it got the
   request from, so the trustworthy part of the header is its right-hand end:
   reading from the right, the first address that is not one of the
   platform's own proxies is the client. A client can add entries on the
   left, never remove the real one on the right.

   Vercel: x-real-ip, which Vercel sets itself.
   Firebase (Cloud Functions, also when reached through a Firebase Hosting
     rewrite): X-Forwarded-For read from the right, skipping Google's front
     end and load balancer ranges, the CDN ranges Hosting has used (Fastly),
     and private addresses. On 8 Oct 2026 it was not known for certain what a
     Hosting rewrite appends, so this does not assume: whichever proxies sit
     in front, the first public address that is not theirs is the visitor.
     PFA_TRUSTED_PROXIES (comma-separated CIDRs) adds ranges without a deploy
     of code.
   Anywhere else (a local server): the socket's own address.

   /api/payment/health shows each server's view of the caller (masked), and
   DEPLOY.command compares the two, so a platform change is noticed. */

const PROXY_V4 = [
  // private, loopback, link-local, carrier-grade NAT
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10',
  // Google front end and load balancers (what sits in front of Cloud Run and Cloud Functions)
  '35.191.0.0/16', '130.211.0.0/22',
  // Fastly, which served Firebase Hosting
  '23.235.32.0/20', '43.249.72.0/22', '103.244.50.0/24', '103.245.222.0/23', '103.245.224.0/24', '104.156.80.0/20',
  '140.248.64.0/18', '140.248.128.0/17', '146.75.0.0/17', '151.101.0.0/16', '157.52.64.0/18', '167.82.0.0/17',
  '167.82.128.0/20', '167.82.160.0/20', '167.82.224.0/20', '172.111.64.0/18', '185.31.16.0/22', '199.27.72.0/21',
  '199.232.0.0/16'
];
const PROXY_V6 = [/^::1$/, /^f[cd][0-9a-f]{2}:/i, /^fe[89ab][0-9a-f]:/i, /^2a04:4e4[02]:/i];

function v4(text) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text || ''));
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function cidr(text) {
  const [base, bits] = String(text || '').trim().split('/');
  const n = v4(base);
  const b = Number(bits);
  if (n === null || !Number.isInteger(b) || b < 0 || b > 32) return null;
  const mask = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
  return { net: (n & mask) >>> 0, mask };
}

let ranges = null;
let rangesFrom = null;
function proxyRanges() {
  const extra = String(process.env.PFA_TRUSTED_PROXIES || '');
  if (ranges && rangesFrom === extra) return ranges;
  rangesFrom = extra;
  ranges = PROXY_V4.concat(extra.split(',')).map(cidr).filter(Boolean);
  return ranges;
}

/* A bare address: strips a port, IPv6 brackets and the IPv4-mapped prefix. */
function bare(value) {
  let s = String(value || '').trim().replace(/^"|"$/g, '');
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracket) s = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.replace(/:\d+$/, '');
  return s.replace(/^::ffff:/i, '');
}

function isProxy(address) {
  const a = bare(address);
  const n = v4(a);
  if (n !== null) return proxyRanges().some((r) => ((n & r.mask) >>> 0) === r.net);
  return PROXY_V6.some((re) => re.test(a));
}

function list(value) {
  return (Array.isArray(value) ? value.join(',') : String(value || '')).split(',').map(bare).filter(Boolean);
}

function clientIp(request) {
  const h = (request && request.headers) || {};
  const socket = bare((request && ((request.socket && request.socket.remoteAddress) || (request.connection && request.connection.remoteAddress))) || '');
  if (process.env.VERCEL) {
    return list(h['x-real-ip'])[0] || list(h['x-vercel-forwarded-for'])[0] || list(h['x-forwarded-for'])[0] || socket;
  }
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FIREBASE_CONFIG) {
    const hops = list(h['x-forwarded-for']);
    for (let i = hops.length - 1; i >= 0; i -= 1) if (!isProxy(hops[i])) return hops[i];
    return hops[0] || socket;
  }
  return socket;
}

/* For showing which address a server saw without publishing it whole:
   203.0.113.x, or the first four groups of an IPv6 address. */
function masked(address) {
  const a = bare(address);
  if (v4(a) !== null) return a.replace(/\.\d+$/, '.x');
  if (a.includes(':')) return `${a.split(':').slice(0, 4).join(':')}:x`;
  return a ? 'x' : '';
}

module.exports = { clientIp, isProxy, masked };

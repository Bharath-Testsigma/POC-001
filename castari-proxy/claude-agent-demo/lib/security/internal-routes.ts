const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const TOKEN_HEADERS = ['x-demo-token', 'x-internal-route-token'] as const;

type ProtectionMode = 'off' | 'local-only';

export function enforceInternalRouteAccess(request: Request): Response | null {
  const mode = getProtectionMode();
  if (mode === 'off') return null;

  if (hasValidBypassToken(request)) return null;
  if (isLocalRequest(request)) return null;

  return new Response(
    JSON.stringify({
      error:
        'Access denied. Internal demo routes accept local requests only by default. Set DEMO_ROUTE_PROTECTION=off to allow remote access.',
    }),
    {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }
  );
}

function getProtectionMode(): ProtectionMode {
  return process.env.DEMO_ROUTE_PROTECTION === 'off' ? 'off' : 'local-only';
}

function hasValidBypassToken(request: Request): boolean {
  const expected = process.env.INTERNAL_ROUTE_TOKEN?.trim();
  if (!expected) return false;

  for (const headerName of TOKEN_HEADERS) {
    const value = request.headers.get(headerName)?.trim();
    if (value && value === expected) return true;
  }

  const auth = request.headers.get('authorization')?.trim();
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7).trim() === expected;
  }

  return false;
}

function isLocalRequest(request: Request): boolean {
  return collectRequestHosts(request).some((host) => LOCAL_HOSTS.has(host));
}

function collectRequestHosts(request: Request): string[] {
  const hosts = new Set<string>();
  addHost(hosts, request.url);
  addHost(hosts, request.headers.get('host'));
  addHost(hosts, request.headers.get('x-forwarded-host'));
  addHost(hosts, request.headers.get('origin'));
  addHost(hosts, request.headers.get('referer'));
  return Array.from(hosts);
}

function addHost(hosts: Set<string>, value: string | null | undefined) {
  if (!value) return;

  try {
    const parsed = new URL(value);
    if (parsed.hostname) {
      hosts.add(parsed.hostname.toLowerCase());
      return;
    }
  } catch {
    // fall back to header-style host parsing below
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return;
  const host = trimmed.startsWith('[')
    ? trimmed.slice(0, trimmed.indexOf(']') + 1)
    : trimmed.split(':', 1)[0];
  if (host) hosts.add(host);
}

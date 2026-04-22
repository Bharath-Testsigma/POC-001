import { afterEach, describe, expect, it } from 'vitest';
import { enforceInternalRouteAccess } from '@/lib/security/internal-routes';

const ORIGINAL_ENV = { ...process.env };

describe('enforceInternalRouteAccess', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('allows local requests by default', () => {
    const request = new Request('http://localhost:3000/api/generate', {
      method: 'POST',
      headers: { host: 'localhost:3000' },
    });

    expect(enforceInternalRouteAccess(request)).toBeNull();
  });

  it('blocks non-local requests by default', async () => {
    const request = new Request('https://demo.example.com/api/generate', {
      method: 'POST',
      headers: { host: 'demo.example.com' },
    });

    const response = enforceInternalRouteAccess(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error:
        'Access denied. Internal demo routes accept local requests only by default. Set DEMO_ROUTE_PROTECTION=off to allow remote access.',
    });
  });

  it('allows remote requests when protection is disabled', () => {
    process.env.DEMO_ROUTE_PROTECTION = 'off';
    const request = new Request('https://demo.example.com/api/generate', {
      method: 'POST',
      headers: { host: 'demo.example.com' },
    });

    expect(enforceInternalRouteAccess(request)).toBeNull();
  });
});

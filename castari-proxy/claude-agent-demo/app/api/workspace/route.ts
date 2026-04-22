import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { ATTO_WORKSPACE } from '@/lib/agent/atto-session';
import { enforceInternalRouteAccess } from '@/lib/security/internal-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const accessDenied = enforceInternalRouteAccess(req);
  if (accessDenied) return accessDenied;

  try {
    fs.mkdirSync(ATTO_WORKSPACE, { recursive: true });
    const files = fs
      .readdirSync(ATTO_WORKSPACE)
      .filter((f) => f.endsWith('.xml'))
      .map((name) => ({
        name,
        size: fs.statSync(path.join(ATTO_WORKSPACE, name)).size,
        modified: fs.statSync(path.join(ATTO_WORKSPACE, name)).mtimeMs,
      }))
      .sort((a, b) => b.modified - a.modified);
    return Response.json({ files });
  } catch {
    return Response.json({ files: [] });
  }
}

export async function DELETE(_req: NextRequest) {
  const accessDenied = enforceInternalRouteAccess(_req);
  if (accessDenied) return accessDenied;

  try {
    if (fs.existsSync(ATTO_WORKSPACE)) {
      fs.rmSync(ATTO_WORKSPACE, { recursive: true, force: true });
      fs.mkdirSync(ATTO_WORKSPACE, { recursive: true });
    }
    return Response.json({ message: 'Workspace cleared' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to clear workspace';
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

import fs from 'node:fs';
import path from 'node:path';

function canonicalize(p: string) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureInside(base: string, candidate: string) {
  const basePath = canonicalize(base);
  const candidatePath = canonicalize(
    path.isAbsolute(candidate) ? candidate : path.join(basePath, candidate)
  );

  if (candidatePath === basePath) {
    return candidatePath;
  }

  if (!candidatePath.startsWith(basePath + path.sep)) {
    throw new Error(`Path escapes jail: ${candidate}`);
  }

  return candidatePath;
}

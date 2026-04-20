import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const demoRoot = process.cwd();
const projectRoot = resolve(demoRoot, '..');
const source = resolve(projectRoot, 'src');
const target = resolve(demoRoot, 'node_modules', 'castari-proxy');

if (!existsSync(source)) {
  console.warn('[castari-proxy] source folder not found:', source);
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(resolve(demoRoot, 'node_modules'), { recursive: true });
cpSync(source, target, { recursive: true });
console.log('[castari-proxy] synced', source, '->', target);

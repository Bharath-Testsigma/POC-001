import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPolicy } from '@/lib/policy/permission';
import { PROJECT_CWD } from '@/lib/env';

describe('buildPolicy', () => {
  it('denies tools outside of the allow list', async () => {
    const policy = buildPolicy('safe');
    const result = await policy.canUseTool('Bash', { command: 'ls' });
    expect(result.behavior).toBe('deny');
  });

  it('normalizes read paths inside the project jail', async () => {
    const policy = buildPolicy('safe');
    const inputPath = path.join(PROJECT_CWD, 'package.json');
    const result = await policy.canUseTool('Read', { file_path: inputPath });
    expect(result.behavior).toBe('allow');
    const updated = result.updatedInput as { file_path: string };
    expect(updated.file_path).toBe(inputPath);
  });

  it('rejects read attempts outside of the project jail', async () => {
    const policy = buildPolicy('safe');
    const result = await policy.canUseTool('Read', { file_path: '/../etc/passwd' });
    expect(result.behavior).toBe('deny');
  });

  it('routes write operations into the dedicated out directory', async () => {
    const policy = buildPolicy('full');
    const result = await policy.canUseTool('Write', { file_path: 'notes/output.txt', content: 'hello' });
    expect(result.behavior).toBe('allow');
    const writePath = path.join(PROJECT_CWD, '.data', 'out');
    const updated = result.updatedInput as { file_path: string };
    expect(updated.file_path.startsWith(writePath)).toBe(true);
  });
});

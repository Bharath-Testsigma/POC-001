import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_CWD } from '@/lib/env';
import { ensureDir } from '@/lib/policy/paths';

export interface TranscriptEntry {
  ts: number;
  kind: string;
  payload: unknown;
}

export interface TranscriptStore {
  append(sessionId: string, entry: TranscriptEntry): Promise<void>;
}

const baseDir = path.join(PROJECT_CWD, '.data', 'sessions');
ensureDir(baseDir);

function sanitizeSessionId(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9-_]/g, '_') || 'session';
}

class FileTranscriptStore implements TranscriptStore {
  async append(sessionId: string, entry: TranscriptEntry) {
    const safeId = sanitizeSessionId(sessionId);
    const filePath = path.join(baseDir, `${safeId}.jsonl`);
    const payload = `${JSON.stringify(entry)}\n`;
    await fs.promises.appendFile(filePath, payload, 'utf8');
  }
}

export const transcriptStore: TranscriptStore = new FileTranscriptStore();

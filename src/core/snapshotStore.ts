import { promises as fs } from 'fs';
import * as path from 'path';
import type { ChatMessage } from './summarizer';

export interface SessionSnapshot {
  id: string;
  createdAt: string;
  usedTokens: number;
  pinnedFiles: string[];
  recentMessages: ChatMessage[];
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class SnapshotStore {
  constructor(private readonly dir: string) {}

  private pathFor(id: string): string {
    if (!ID_RE.test(id)) {
      throw new Error(`invalid snapshot id: ${id}`);
    }
    return path.join(this.dir, `snapshot-${id}.json`);
  }

  async save(snapshot: SessionSnapshot): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.pathFor(snapshot.id), JSON.stringify(snapshot, null, 2), 'utf8');
  }

  async load(id: string): Promise<SessionSnapshot | null> {
    try {
      const raw = await fs.readFile(this.pathFor(id), 'utf8');
      const parsed = JSON.parse(raw) as SessionSnapshot;
      if (typeof parsed?.id !== 'string' || !Array.isArray(parsed.pinnedFiles)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.dir);
      return entries
        .filter((name) => name.startsWith('snapshot-') && name.endsWith('.json'))
        .map((name) => name.slice('snapshot-'.length, -'.json'.length))
        .sort();
    } catch {
      return [];
    }
  }
}

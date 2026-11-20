import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface PinnedFile {
  path: string;
  content: string;
  pinnedAt: string;
}

export interface PinManagerOptions {
  maxPinnedFiles: number;
  cwd?: string;
}

export class PinManager {
  private readonly files = new Map<string, PinnedFile>();
  private readonly cwd: string;
  private gitRoot: string | null | undefined;

  constructor(private readonly options: PinManagerOptions) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
  }

  get maxPinnedFiles(): number {
    return this.options.maxPinnedFiles;
  }

  private resolve(filePath: string): string {
    return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(this.cwd, filePath);
  }

  list(): PinnedFile[] {
    return [...this.files.values()].sort((a, b) => a.pinnedAt.localeCompare(b.pinnedAt));
  }

  isPinned(filePath: string): boolean {
    return this.files.has(this.resolve(filePath));
  }

  async pin(filePath: string): Promise<PinnedFile> {
    const resolved = this.resolve(filePath);
    const existing = this.files.get(resolved);
    if (existing) return existing;
    if (this.files.size >= this.options.maxPinnedFiles) {
      throw new Error(`pin limit reached (max ${this.options.maxPinnedFiles}); unpin first`);
    }
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new Error(`not a readable file: ${filePath}`);
    }
    const content = await fs.readFile(resolved, 'utf8');
    const entry: PinnedFile = { path: resolved, content, pinnedAt: new Date().toISOString() };
    this.files.set(resolved, entry);
    return entry;
  }

  unpin(filePath: string): boolean {
    return this.files.delete(this.resolve(filePath));
  }

  /** git diff of a pinned file since its pinned snapshot; null when unavailable. */
  async diffFor(filePath: string): Promise<string | null> {
    const resolved = this.resolve(filePath);
    if (!this.files.has(resolved)) return null;
    const root = await this.findGitRoot();
    if (!root) return null;
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--', resolved], {
        cwd: root,
        windowsHide: true,
      });
      return stdout;
    } catch {
      return null;
    }
  }

  async diffsForAll(): Promise<Array<{ path: string; diff: string }>> {
    const out: Array<{ path: string; diff: string }> = [];
    for (const entry of this.list()) {
      const diff = await this.diffFor(entry.path);
      if (diff) out.push({ path: entry.path, diff });
    }
    return out;
  }

  private async findGitRoot(): Promise<string | null> {
    if (this.gitRoot !== undefined) return this.gitRoot;
    this.gitRoot = await findGitRoot(this.cwd);
    return this.gitRoot;
  }
}

async function findGitRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  for (;;) {
    const gitPath = path.join(dir, '.git');
    try {
      const stat = await fs.stat(gitPath);
      if (stat.isDirectory() || stat.isFile()) return dir;
    } catch {
      // no .git here, walk up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

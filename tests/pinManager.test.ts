import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { PinManager } from '../src/core/pinManager';

const execFileAsync = promisify(execFile);

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dsh-cw-'));
}

describe('PinManager', () => {
  test('pins a file and returns its content snapshot', async () => {
    const dir = await makeTmpDir();
    const file = path.join(dir, 'a.txt');
    await fs.writeFile(file, 'hello pin', 'utf8');
    const pins = new PinManager({ maxPinnedFiles: 5, cwd: dir });
    const entry = await pins.pin('a.txt');
    expect(entry.content).toBe('hello pin');
    expect(entry.path).toBe(file);
    expect(pins.isPinned('a.txt')).toBe(true);
    expect(pins.list()).toHaveLength(1);
  });

  test('pinning the same file twice returns the same entry', async () => {
    const dir = await makeTmpDir();
    const file = path.join(dir, 'a.txt');
    await fs.writeFile(file, 'x', 'utf8');
    const pins = new PinManager({ maxPinnedFiles: 5, cwd: dir });
    const first = await pins.pin('a.txt');
    const second = await pins.pin('a.txt');
    expect(second).toBe(first);
    expect(pins.list()).toHaveLength(1);
  });

  test('enforces the pin limit', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, '1.txt'), '1', 'utf8');
    await fs.writeFile(path.join(dir, '2.txt'), '2', 'utf8');
    await fs.writeFile(path.join(dir, '3.txt'), '3', 'utf8');
    const pins = new PinManager({ maxPinnedFiles: 2, cwd: dir });
    await pins.pin('1.txt');
    await pins.pin('2.txt');
    await expect(pins.pin('3.txt')).rejects.toThrow(/pin limit/);
  });

  test('unpin frees a slot', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, '1.txt'), '1', 'utf8');
    await fs.writeFile(path.join(dir, '2.txt'), '2', 'utf8');
    await fs.writeFile(path.join(dir, '3.txt'), '3', 'utf8');
    const pins = new PinManager({ maxPinnedFiles: 2, cwd: dir });
    await pins.pin('1.txt');
    await pins.pin('2.txt');
    expect(pins.unpin('1.txt')).toBe(true);
    await expect(pins.pin('3.txt')).resolves.toBeDefined();
    expect(pins.unpin('missing.txt')).toBe(false);
  });

  test('rejects paths that are not readable files', async () => {
    const dir = await makeTmpDir();
    const pins = new PinManager({ maxPinnedFiles: 5, cwd: dir });
    await expect(pins.pin('missing.txt')).rejects.toThrow(/not a readable file/);
    await expect(pins.pin('.')).rejects.toThrow(/not a readable file/);
  });

  test('diffFor returns null outside a git repo', async () => {
    const dir = await makeTmpDir();
    const file = path.join(dir, 'a.txt');
    await fs.writeFile(file, 'x', 'utf8');
    const pins = new PinManager({ maxPinnedFiles: 5, cwd: dir });
    await pins.pin('a.txt');
    expect(await pins.diffFor('a.txt')).toBeNull();
    expect(await pins.diffFor('other.txt')).toBeNull();
    expect(await pins.diffsForAll()).toEqual([]);
  });

  test('diffFor returns the working-tree diff inside a git repo', async () => {
    let gitOk = true;
    try {
      await execFileAsync('git', ['--version']);
    } catch {
      gitOk = false;
    }
    if (!gitOk) return;

    const dir = await makeTmpDir();
    await execFileAsync('git', ['init', '-q'], { cwd: dir });
    const file = path.join(dir, 'a.txt');
    await fs.writeFile(file, 'before\n', 'utf8');
    await execFileAsync('git', ['add', 'a.txt'], { cwd: dir });
    await execFileAsync(
      'git',
      ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init'],
      { cwd: dir },
    );
    await fs.writeFile(file, 'after\n', 'utf8');

    const pins = new PinManager({ maxPinnedFiles: 5, cwd: dir });
    await pins.pin('a.txt');
    const diff = await pins.diffFor('a.txt');
    expect(diff).toContain('+after');
    const all = await pins.diffsForAll();
    expect(all).toHaveLength(1);
    expect(all[0].diff).toContain('+after');
  });
});

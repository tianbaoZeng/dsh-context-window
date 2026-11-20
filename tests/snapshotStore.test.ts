import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SnapshotStore, type SessionSnapshot } from '../src/core/snapshotStore';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dsh-cw-'));
}

function snapshot(id: string): SessionSnapshot {
  return {
    id,
    createdAt: new Date().toISOString(),
    usedTokens: 1234,
    pinnedFiles: ['C:\\proj\\a.ts'],
    recentMessages: [{ role: 'user', content: 'hi' }],
  };
}

describe('SnapshotStore', () => {
  test('save and load roundtrip', async () => {
    const dir = await makeTmpDir();
    const store = new SnapshotStore(path.join(dir, '.dsh'));
    await store.save(snapshot('demo'));
    const loaded = await store.load('demo');
    expect(loaded).not.toBeNull();
    expect(loaded!.usedTokens).toBe(1234);
    expect(loaded!.pinnedFiles).toEqual(['C:\\proj\\a.ts']);
  });

  test('list returns saved ids', async () => {
    const dir = await makeTmpDir();
    const store = new SnapshotStore(path.join(dir, '.dsh'));
    await store.save(snapshot('b'));
    await store.save(snapshot('a'));
    expect(await store.list()).toEqual(['a', 'b']);
  });

  test('load returns null for missing or corrupted snapshots', async () => {
    const dir = await makeTmpDir();
    const store = new SnapshotStore(path.join(dir, '.dsh'));
    expect(await store.load('nope')).toBeNull();
    await fs.mkdir(path.join(dir, '.dsh'), { recursive: true });
    await fs.writeFile(path.join(dir, '.dsh', 'snapshot-bad.json'), '{not json', 'utf8');
    expect(await store.load('bad')).toBeNull();
  });

  test('rejects unsafe ids', async () => {
    const dir = await makeTmpDir();
    const store = new SnapshotStore(path.join(dir, '.dsh'));
    await expect(store.save(snapshot('../evil'))).rejects.toThrow(/invalid snapshot id/);
    expect(await store.load('../evil')).toBeNull();
  });
});

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DiffInjector } from '../src/core/diffInjector';
import { PinManager } from '../src/core/pinManager';

describe('DiffInjector', () => {
  test('matches the trigger phrase case-insensitively', () => {
    const injector = new DiffInjector({} as never, 'continue from where we left off', () => {});
    expect(injector.matches('CONTINUE from where WE left OFF')).toBe(true);
    expect(injector.matches('let us start over')).toBe(false);
  });

  test('emits the diff payload only on a match', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-cw-'));
    const pins = new PinManager({ maxPinnedFiles: 5, cwd: dir });
    const received: unknown[] = [];
    const injector = new DiffInjector(pins, 'continue from where we left off', (p) => received.push(p));

    expect(await injector.check('unrelated message')).toBe(false);
    expect(received).toHaveLength(0);

    expect(await injector.check('can we continue from where we left off?')).toBe(true);
    expect(received).toEqual([{ diffs: [] }]);
  });
});

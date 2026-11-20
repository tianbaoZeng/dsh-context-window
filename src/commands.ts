import type { ContextMeter } from './core/contextMeter';
import type { PinManager } from './core/pinManager';
import type { SnapshotStore, SessionSnapshot } from './core/snapshotStore';
import type { ChatMessage } from './core/summarizer';
import { estimateTokens } from './core/tokenEstimator';

export interface CommandDeps {
  pins: PinManager;
  meter: ContextMeter;
  store: SnapshotStore;
  threshold: number;
  getHistory: () => ChatMessage[];
}

export type CommandHandler = (args: string[]) => Promise<string> | string;

export const COMMAND_DESCRIPTIONS: Record<string, string> = {
  pin: 'Keep a file in the context regardless of eviction',
  unpin: 'Release a previously pinned file',
  snapshot: 'Save the current context state to a session snapshot',
  restore: 'Restore a session snapshot by id',
  'context-status': 'Show context-window usage, ratio and pinned files',
};

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createCommandHandlers(deps: CommandDeps): Record<string, CommandHandler> {
  const { pins, meter, store, getHistory } = deps;
  return {
    pin: async (args) => {
      const target = args.join(' ').trim();
      if (!target) return 'usage: /pin <file>';
      try {
        const entry = await pins.pin(target);
        return `pinned ${entry.path} (${estimateTokens(entry.content)} tok est.)`;
      } catch (e) {
        return `error: ${errorText(e)}`;
      }
    },

    unpin: (args) => {
      const target = args.join(' ').trim();
      if (!target) return 'usage: /unpin <file>';
      return pins.unpin(target) ? `unpinned ${target}` : `not pinned: ${target}`;
    },

    snapshot: async () => {
      const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const snapshot: SessionSnapshot = {
        id,
        createdAt: new Date().toISOString(),
        usedTokens: Math.round(meter.usedTokens),
        pinnedFiles: pins.list().map((p) => p.path),
        recentMessages: getHistory().slice(-20),
      };
      try {
        await store.save(snapshot);
        return `saved snapshot ${id} (${snapshot.usedTokens} tok, ${snapshot.pinnedFiles.length} pinned)`;
      } catch (e) {
        return `error: ${errorText(e)}`;
      }
    },

    restore: async (args) => {
      const id = args[0]?.trim();
      if (!id) return 'usage: /restore <id>';
      const snapshot = await store.load(id);
      if (!snapshot) return `error: snapshot not found: ${id}`;
      meter.setUsed(snapshot.usedTokens);
      const warnings: string[] = [];
      for (const file of snapshot.pinnedFiles) {
        try {
          await pins.pin(file);
        } catch (e) {
          warnings.push(`  - ${file}: ${errorText(e)}`);
        }
      }
      const head = `restored ${snapshot.id} (created ${snapshot.createdAt}, ${snapshot.usedTokens} tok)`;
      return warnings.length ? `${head}\nwarnings:\n${warnings.join('\n')}` : head;
    },

    'context-status': () => {
      const pinned = pins.list();
      const lines = [
        meter.renderColored(deps.threshold),
        `pinned ${pinned.length}/${pins.maxPinnedFiles}`,
      ];
      for (const p of pinned) lines.push(`  ${p.path} (${estimateTokens(p.content)} tok est.)`);
      return lines.join('\n');
    },
  };
}

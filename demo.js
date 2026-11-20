// Local smoke demo for dsh-context-window: wires the plugin against a fake
// Cordis host and simulates a short session so the effect is visible without
// installing DSH. Run: node demo.js
const path = require('path');
const { wire } = require('./dist/index.js');

class FakeContext {
  constructor() {
    this.commands = { register: (d) => { this.commandDefs.push(d); return () => {}; } };
    this.tools = { register: (d) => { this.toolDefs.push(d); return () => {}; } };
    this.commandDefs = [];
    this.toolDefs = [];
    this.listeners = new Map();
    this.events = [];
    this.logger = { info: console.log, warn: console.log };
  }
  on(event, listener) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return () => {};
  }
  emit(event, ...args) {
    this.events.push({ event, args });
  }
  effect() {}
  fire(event, payload) {
    for (const l of this.listeners.get(event) ?? []) l(payload);
  }
  async cmd(name, args = []) {
    const def = this.commandDefs.find((c) => c.name === name);
    return def ? String(await def.handler(args)) : `(no command ${name})`;
  }
}

const ctx = new FakeContext();
// Small window + low threshold so the demo triggers everything quickly.
const { meter } = wire(ctx, { windowTokens: 200, threshold: 0.5, maxPinnedFiles: 3 });

async function main() {
  console.log('== 1. plugin wired: registered commands/tools ==');
  console.log('commands:', ctx.commandDefs.map((c) => c.name).join(', '));
  console.log('tools:   ', ctx.toolDefs.map((t) => t.name).join(', '));

  console.log('\n== 2. simulate conversation (session/event) ==');
  const long = 'x'.repeat(240); // ~60 tokens each
  ctx.fire('session/event', { type: 'user/message', content: 'please refactor the auth module ' + long });
  ctx.fire('session/event', { type: 'assistant/message', content: long });
  ctx.fire('session/event', { type: 'user/message', content: 'continue with tests ' + long });
  await new Promise((r) => setImmediate(r));
  console.log(await ctx.cmd('context-status'));

  console.log('\n== 3. threshold crossing -> auto-summary event ==');
  const summary = ctx.events.find((e) => e.event === 'dsh-context-window/summary-ready');
  console.log(summary ? `emitted summary-ready: ${JSON.stringify(summary.args[0])}` : '(not emitted yet)');

  console.log('\n== 4. pin a file ==');
  console.log(await ctx.cmd('pin', [path.join(__dirname, 'README.md')]));
  console.log(await ctx.cmd('pin', [path.join(__dirname, 'LICENSE')]));
  console.log(await ctx.cmd('context-status'));

  console.log('\n== 5. snapshot + restore ==');
  const snap = await ctx.cmd('snapshot');
  console.log(snap);
  const id = (snap.match(/saved snapshot (\S+)/) || [])[1];
  ctx.fire('session/event', { type: 'user/message', content: long + long }); // burn more tokens
  console.log(await ctx.cmd('context-status'));
  console.log(await ctx.cmd('restore', [id]));
  console.log(await ctx.cmd('context-status'));

  console.log('\n== 6. diff trigger phrase ==');
  ctx.fire('session/event', { type: 'user/message', content: 'let us continue from where we left off' });
  await new Promise((r) => setTimeout(r, 100)); // diff check walks the fs, give it time
  const diff = ctx.events.find((e) => e.event === 'dsh-context-window/diff-inject');
  console.log(diff ? `emitted diff-inject with ${diff.args[0].diffs.length} diffs (not a git repo here)` : '(not emitted)');

  console.log('\n== done: meter ends at', Math.round(meter.usedTokens), 'tokens ==');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { ContextMeter } from '../src/core/contextMeter';
import { Summarizer, type ChatMessage } from '../src/core/summarizer';

function messages(n: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}: ${'x'.repeat(80)}`,
    });
  }
  return out;
}

describe('Summarizer', () => {
  test('shouldRun is false below the threshold', () => {
    const meter = new ContextMeter(100);
    meter.setUsed(10);
    const s = new Summarizer({ threshold: 0.8, auto: true });
    expect(s.shouldRun(meter, 20)).toBe(false);
  });

  test('shouldRun is false when auto is disabled', () => {
    const meter = new ContextMeter(100);
    meter.setUsed(90);
    const s = new Summarizer({ threshold: 0.8, auto: false });
    expect(s.shouldRun(meter, 20)).toBe(false);
  });

  test('shouldRun avoids re-summarising until new content arrives', async () => {
    const meter = new ContextMeter(100);
    meter.setUsed(90);
    const s = new Summarizer({ threshold: 0.8, auto: true });
    expect(s.shouldRun(meter, 10)).toBe(true);
    await s.run(messages(10));
    expect(s.shouldRun(meter, 10)).toBe(false);
    expect(s.shouldRun(meter, 11)).toBe(false);
    expect(s.shouldRun(meter, 13)).toBe(true);
  });

  test('extractive keeps the first message and the newest exchange', () => {
    const s = new Summarizer({ threshold: 0.8, auto: true });
    const compacted = s.extractive(messages(10));
    expect(compacted.length).toBe(5);
    expect(compacted[0].content).toBe('message 0: ' + 'x'.repeat(80));
    expect(compacted[1].content).toContain('[summarised 6 earlier messages]');
    expect(compacted[compacted.length - 1].content).toContain('message 9');
  });

  test('extractive leaves small histories untouched', () => {
    const s = new Summarizer({ threshold: 0.8, auto: true });
    const original = messages(5);
    expect(s.extractive(original)).toEqual(original);
  });

  test('run uses the LLM callback and never summarises the newest exchange', async () => {
    const s = new Summarizer({ threshold: 0.8, auto: true }, async () => 'llm summary text');
    const compacted = await s.run(messages(8));
    expect(compacted).toHaveLength(3);
    expect(compacted[0].content).toBe('[session summary]\nllm summary text');
    expect(compacted[1].content).toContain('message 6');
    expect(compacted[2].content).toContain('message 7');
  });

  test('run falls back to extractive when the LLM callback fails', async () => {
    const s = new Summarizer(
      { threshold: 0.8, auto: true },
      async () => {
        throw new Error('llm down');
      },
    );
    const compacted = await s.run(messages(10));
    expect(compacted.some((m) => m.content.includes('[summarised'))).toBe(true);
  });
});

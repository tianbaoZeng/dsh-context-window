import type { ContextMeter } from './contextMeter';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LlmSummarizeFn = (messages: ChatMessage[]) => Promise<string>;

export interface SummarizerOptions {
  threshold: number;
  auto: boolean;
}

export class Summarizer {
  private lastSummarizedLength = 0;

  constructor(
    private readonly options: SummarizerOptions,
    private readonly summarizeWithLlm?: LlmSummarizeFn,
  ) {}

  /** Avoid re-summarising until new content has actually accumulated. */
  shouldRun(meter: ContextMeter, historyLength: number): boolean {
    if (!this.options.auto) return false;
    if (!meter.isAbove(this.options.threshold)) return false;
    if (historyLength <= this.lastSummarizedLength + 2) return false;
    return true;
  }

  /**
   * Extractive fallback used when no LLM callback is wired: keeps the first
   * message and the newest exchange, digests the middle.
   */
  extractive(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= 6) return messages;
    const middle = messages.slice(1, -3);
    const digest = middle
      .map((m) => {
        const clipped = m.content.length > 120 ? `${m.content.slice(0, 120)}…` : m.content;
        return `${m.role}: ${clipped}`;
      })
      .join('\n');
    const summary: ChatMessage = {
      role: 'assistant',
      content: `[summarised ${middle.length} earlier messages]\n${digest}`,
    };
    return [messages[0], summary, ...messages.slice(-3)];
  }

  /** Compacts the history; the newest exchange is never summarised. */
  async run(messages: ChatMessage[]): Promise<ChatMessage[]> {
    this.lastSummarizedLength = messages.length;
    if (this.summarizeWithLlm && messages.length > 4) {
      try {
        const text = await this.summarizeWithLlm(messages.slice(0, -2));
        return [
          { role: 'assistant', content: `[session summary]\n${text}` },
          ...messages.slice(-2),
        ];
      } catch {
        // fall through to the extractive path on LLM failure
      }
    }
    return this.extractive(messages);
  }
}

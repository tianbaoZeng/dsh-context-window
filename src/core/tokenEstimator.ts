// Token estimation without a tokenizer: CJK characters count ~1 token each
// in common BPE vocabularies; everything else is approximated at 4 chars per
// token. Deterministic and cheap enough for per-message accounting. Whenever
// an event payload carries real usage numbers, callers should prefer
// usageFromPayload() over this estimate.

const CJK_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\uff00-\uffef]/;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    if (CJK_RE.test(ch)) cjk++;
  }
  const other = text.length - cjk;
  return Math.ceil(cjk + other / 4);
}

export function usageFromPayload(payload: unknown): number | undefined {
  const p = payload as Record<string, any> | null | undefined;
  if (!p || typeof p !== 'object') return undefined;
  const usage = p.usage;
  if (usage && typeof usage === 'object') {
    const total = usage.total_tokens ?? usage.totalTokens;
    if (typeof total === 'number' && Number.isFinite(total)) return total;
    const input = usage.prompt_tokens ?? usage.input_tokens;
    const output = usage.completion_tokens ?? usage.output_tokens;
    if (typeof input === 'number' && typeof output === 'number') return input + output;
  }
  const direct = p.total_tokens ?? p.tokens;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  return undefined;
}

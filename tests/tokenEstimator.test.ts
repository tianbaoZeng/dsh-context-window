import { estimateTokens, usageFromPayload } from '../src/core/tokenEstimator';

describe('estimateTokens', () => {
  test('empty text is 0 tokens', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('ASCII text is approximated at 4 chars per token', () => {
    // 28 chars -> ceil(28/4) = 7
    expect(estimateTokens('hello world, this is a test')).toBe(7);
  });

  test('CJK characters count 1 token each', () => {
    expect(estimateTokens('你好世界')).toBe(4);
  });

  test('mixed CJK and ASCII is counted separately', () => {
    // 2 CJK + 6 other chars ("hello " = 6, counting the space) -> 2 + ceil(6/4) = 4
    expect(estimateTokens('你好 hello')).toBe(4);
  });
});

describe('usageFromPayload', () => {
  test('reads total_tokens from usage object', () => {
    expect(usageFromPayload({ usage: { total_tokens: 123 } })).toBe(123);
  });

  test('sums prompt and completion tokens', () => {
    expect(usageFromPayload({ usage: { prompt_tokens: 10, completion_tokens: 5 } })).toBe(15);
  });

  test('reads direct total fields', () => {
    expect(usageFromPayload({ total_tokens: 7 })).toBe(7);
    expect(usageFromPayload({ tokens: 9 })).toBe(9);
  });

  test('returns undefined for payloads without usage info', () => {
    expect(usageFromPayload(null)).toBeUndefined();
    expect(usageFromPayload(undefined)).toBeUndefined();
    expect(usageFromPayload({})).toBeUndefined();
    expect(usageFromPayload('text')).toBeUndefined();
  });
});

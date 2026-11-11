/** US dollars per million tokens, input and output, as of October 2026. For estimates only. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-fable-5-1": [10, 50],
};

/** US dollars for the tokens of a request, or null when the model's price is not known. */
export function costOf(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number | null {
  const price = PRICES[model];
  return price ? (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1e6 : null;
}

import { callOpenAI } from './openai.js';
import { callAnthropic } from './anthropic.js';

export const PROVIDERS = {
  openAi: { label: 'OpenAI', call: callOpenAI },
  anthropic: { label: 'Anthropic', call: callAnthropic },
};

export function getProvider(name) {
  return PROVIDERS[name] || null;
}

/**
 * Parse a streaming SSE response and call onEvent for each parsed JSON data line.
 * Handles the [DONE] sentinel.
 */
export async function parseSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          onEvent(JSON.parse(data));
        } catch {}
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

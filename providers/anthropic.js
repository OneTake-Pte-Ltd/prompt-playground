import { parseSSE } from './index.js';
import { toAnthropicMessages } from '../utils/messages.js';

export async function callAnthropic({ apiKey, params, messages, onChunk, onDone, onError }) {
  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

  const body = {
    model: params.model,
    max_tokens: params.max_tokens || 2048,
    messages: anthropicMessages,
    stream: true,
  };

  if (system) body.system = system;
  if (params.temperature !== undefined && params.temperature !== null) {
    body.temperature = params.temperature;
  }
  if (params.top_p !== undefined && params.top_p !== null) body.top_p = params.top_p;

  // Anthropic doesn't support frequency/presence penalties — they're silently omitted.
  // Merge model_parameters (e.g. thinking: { type: "enabled", budget_tokens: 5000 })
  if (params.model_parameters && typeof params.model_parameters === 'object') {
    Object.assign(body, params.model_parameters);
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const e = await res.json();
        errMsg = e.error?.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    let usage = null;

    await parseSSE(res, (event) => {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        onChunk(event.delta.text);
      }
      if (event.type === 'message_delta' && event.usage) {
        usage = {
          input_tokens: event.usage.input_tokens,
          output_tokens: event.usage.output_tokens,
        };
      }
      if (event.type === 'message_start' && event.message?.usage) {
        usage = {
          input_tokens: event.message.usage.input_tokens,
          output_tokens: event.message.usage.output_tokens,
        };
      }
    });

    onDone(usage);
  } catch (err) {
    onError(err.message || String(err));
  }
}

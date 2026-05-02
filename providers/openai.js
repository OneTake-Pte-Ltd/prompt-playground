import { parseSSE } from './index.js';
import { toOpenAIMessages } from '../utils/messages.js';

export async function callOpenAI({ apiKey, params, messages, responseFormat, onChunk, onDone, onError }) {
  const processedMessages = toOpenAIMessages(messages);

  const body = {
    model: params.model,
    messages: processedMessages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (params.temperature !== undefined && params.temperature !== null) {
    body.temperature = params.temperature;
  }
  if (params.max_completion_tokens) body.max_completion_tokens = params.max_completion_tokens;
  if (params.top_p !== undefined && params.top_p !== null) body.top_p = params.top_p;
  if (params.frequency_penalty !== undefined && params.frequency_penalty !== null) {
    body.frequency_penalty = params.frequency_penalty;
  }
  if (params.presence_penalty !== undefined && params.presence_penalty !== null) {
    body.presence_penalty = params.presence_penalty;
  }

  // Merge extra model_parameters (e.g. reasoning: { effort: "low" })
  if (params.model_parameters && typeof params.model_parameters === 'object') {
    Object.assign(body, params.model_parameters);
  }

  if (responseFormat && responseFormat.type !== 'text') {
    body.response_format = responseFormat;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
      if (event.usage) {
        usage = event.usage;
        return;
      }
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) onChunk(delta);
    });

    onDone(usage);
  } catch (err) {
    onError(err.message || String(err));
  }
}

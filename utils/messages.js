/**
 * Normalize messages loaded from a JSON file to internal format (OpenAI format).
 * Converts Anthropic-style image blocks to image_url blocks.
 */
export function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => ({
    ...msg,
    content: normalizeContent(msg.content),
  }));
}

function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => {
    if (block.type === 'image' && block.source) {
      const { source } = block;
      if (source.type === 'base64') {
        return {
          type: 'image_url',
          image_url: { url: `data:${source.media_type};base64,${source.data}` },
        };
      }
      if (source.type === 'url') {
        return { type: 'image_url', image_url: { url: source.url } };
      }
    }
    return block;
  });
}

/**
 * Convert internal messages to OpenAI API format.
 * Handles any remaining Anthropic-format image blocks.
 */
export function toOpenAIMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: toOpenAIContent(msg.content),
  }));
}

function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => {
    if (block.type === 'image' && block.source) {
      const { source } = block;
      if (source.type === 'base64') {
        return {
          type: 'image_url',
          image_url: { url: `data:${source.media_type};base64,${source.data}` },
        };
      }
      if (source.type === 'url') {
        return { type: 'image_url', image_url: { url: source.url } };
      }
    }
    return block;
  });
}

/**
 * Convert internal messages to Anthropic API format.
 * Returns { system, messages } where system is the extracted system prompt string
 * and messages contains only user/assistant messages with Anthropic-format image blocks.
 */
export function toAnthropicMessages(messages) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  let system;
  if (systemMsg) {
    if (typeof systemMsg.content === 'string') {
      system = systemMsg.content;
    } else if (Array.isArray(systemMsg.content)) {
      system = systemMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
    }
  }

  const anthropicMessages = chatMessages.map((msg) => ({
    role: msg.role,
    content: toAnthropicContent(msg.content),
  }));

  return { system, messages: anthropicMessages };
}

function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => {
    if (block.type === 'image_url') {
      const { url } = block.image_url;
      if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        const prefix = url.slice(0, commaIdx); // "data:image/jpeg;base64"
        const data = url.slice(commaIdx + 1);
        const media_type = prefix.replace('data:', '').replace(';base64', '');
        return { type: 'image', source: { type: 'base64', media_type, data } };
      }
      return { type: 'image', source: { type: 'url', url } };
    }
    // text blocks and already-Anthropic image blocks pass through
    return block;
  });
}

/**
 * Substitute template variables in a string.
 * Default delimiters: <% and %> (e.g. <%VARIABLE_NAME%>)
 */
export function substituteVariables(text, variables, delimiters = ['<%', '%>']) {
  const [open, close] = delimiters;
  const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped(open)}\\s*(\\w+)\\s*${escaped(close)}`, 'g');
  return text.replace(pattern, (_, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : _
  );
}

/**
 * Apply variable substitution to all text content in messages.
 * Only substitutes in string content and text blocks; leaves image blocks alone.
 */
export function applyVariablesToMessages(messages, variables, delimiters) {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { ...msg, content: substituteVariables(msg.content, variables, delimiters) };
    }
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((block) => {
          if (block.type === 'text') {
            return { ...block, text: substituteVariables(block.text, variables, delimiters) };
          }
          return block;
        }),
      };
    }
    return msg;
  });
}

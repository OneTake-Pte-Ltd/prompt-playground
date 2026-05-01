import { html, useState, useMemo } from '../lib.js';

function highlightJson(str) {
  // HTML-escape first
  const escaped = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        return /:$/.test(match)
          ? `<span class="json-key">${match}</span>`
          : `<span class="json-string">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span class="json-boolean">${match}</span>`;
      if (match === 'null') return `<span class="json-null">${match}</span>`;
      return `<span class="json-number">${match}</span>`;
    }
  );
}

export function ResponseDisplay({ response, responseFormat, loading, error, usage, provider }) {
  const [copied, setCopied] = useState(false);

  const isJson = ['json_schema', 'json_object', 'json'].includes(responseFormat?.type);
  const showJsonWarning = isJson && provider === 'anthropic';

  const { formatted, highlighted } = useMemo(() => {
    if (!response || loading) return { formatted: response || '', highlighted: null };
    if (!isJson) return { formatted: response, highlighted: null };
    try {
      const pretty = JSON.stringify(JSON.parse(response), null, 2);
      return { formatted: pretty, highlighted: highlightJson(pretty) };
    } catch {
      return { formatted: response, highlighted: null };
    }
  }, [response, isJson, loading]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(response || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const isEmpty = !response && !loading && !error;

  return html`
    <div class="response-display">
      <div class="response-toolbar">
        <span class="response-label">Response</span>
        ${response && html`
          <button class="btn btn-ghost btn-xs" onClick=${handleCopy}>
            ${copied ? '✓ Copied' : 'Copy'}
          </button>
        `}
      </div>

      ${showJsonWarning && html`
        <div class="warning-banner">
          Anthropic doesn't enforce JSON schema — the response may not match the schema structure.
        </div>
      `}

      ${error && html`<div class="error-banner">${error}</div>`}

      <div class=${'response-body' + (isJson && !loading ? ' json' : '')}>
        ${isEmpty && !error && html`<span class="response-empty">Run the prompt to see output here.</span>`}

        ${loading && !response && html`<span class="cursor"></span>`}

        ${response && html`
          ${isJson && highlighted && !loading
            ? html`<pre dangerouslySetInnerHTML=${{ __html: highlighted }}></pre>`
            : html`<span>${response}${loading ? html`<span class="cursor"></span>` : ''}</span>`
          }
        `}
      </div>

      ${(usage || loading) && html`
        <div class="response-footer">
          ${usage && html`
            <span class="token-usage">
              ${usage.prompt_tokens !== undefined
                ? `↑ ${usage.prompt_tokens} / ↓ ${usage.completion_tokens}`
                : `↑ ${usage.input_tokens ?? '?'} / ↓ ${usage.output_tokens ?? '?'}`
              } tokens
            </span>
          `}
          ${loading && html`<span class="spinner" style="margin-left:auto"></span>`}
        </div>
      `}
    </div>
  `;
}

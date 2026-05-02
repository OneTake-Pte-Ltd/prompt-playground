import { html, useState, useMemo } from '../lib.js';
import { formatExpected, formatActual, stripJsonFences } from '../utils/testRunner.js';

function highlightJson(str) {
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

// ─── Inline assertion panel ───────────────────────────────────────────────────
function AssertionPanel({ assertions, running }) {
  const [open, setOpen] = useState(true);

  // assertions === null means no tests loaded at all — don't render anything
  if (assertions === null) return null;

  const isSmokeTest = assertions.length === 0;
  const passed = assertions.filter((r) => r.pass === true).length;
  const total = assertions.length;
  const allPass = isSmokeTest || (!running && passed === total);

  return html`
    <div class="assertion-panel">
      <button class="assertion-panel-header" onClick=${() => setOpen(!open)}>
        <span class="assertion-panel-title">Assertions</span>
        <span class=${'assert-badge ' + (allPass ? 'pass' : 'fail')}>
          ${isSmokeTest ? 'Smoke PASS' : `${passed} / ${total}`}
        </span>
        ${running && html`<span class="spinner" style="width:9px;height:9px;border-width:1.5px;margin-left:4px"></span>`}
        <span class="assertion-toggle-icon">${open ? '▾' : '▸'}</span>
      </button>

      ${open && !isSmokeTest && html`
        <div class="assertion-list">
          ${assertions.map((r, i) => html`
            <div key=${i} class=${'assertion-row ' + (r.pending ? 'pending' : r.pass ? 'pass' : 'fail')}>
              <span class="assertion-icon">
                ${r.pending
                  ? html`<span class="spinner" style="width:9px;height:9px;border-width:1.5px"></span>`
                  : r.pass ? '✓' : '✗'
                }
              </span>
              <span class="assertion-path" title=${r.path}>${r.path}</span>
              <span class="assertion-type">${r.assertion.type}</span>
              <span class="assertion-expected" title=${formatExpected(r.assertion)}>${formatExpected(r.assertion)}</span>
              <span class="assertion-actual" title=${formatActual(r.actual)}>${formatActual(r.actual)}</span>
              ${!r.pending && !r.pass && r.details && html`
                <div class="assertion-detail">${r.details}</div>
              `}
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

export function ResponseDisplay({ response, responseFormat, loading, error, usage, provider, assertions, assertionsRunning }) {
  const [copied, setCopied] = useState(false);

  const isJson = ['json_schema', 'json_object', 'json'].includes(responseFormat?.type);
  const showJsonWarning = isJson && provider === 'anthropic';

  const { formatted, highlighted } = useMemo(() => {
    if (!response || loading) return { formatted: response || '', highlighted: null };
    if (!isJson) return { formatted: response, highlighted: null };
    try {
      const pretty = JSON.stringify(JSON.parse(stripJsonFences(response)), null, 2);
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

      <${AssertionPanel} assertions=${assertions} running=${assertionsRunning} />

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

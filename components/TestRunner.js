import { html, useState, useRef } from '../lib.js';
import {
  walkExpected,
  evalDeterministic,
  formatExpected,
  formatActual,
  buildJudgeMessages,
  parseJudgeResponse,
} from '../utils/testRunner.js';
import { applyVariablesToMessages } from '../utils/variables.js';
import { getProvider } from '../providers/index.js';

const JUDGE_MODEL = 'gpt-5.4';

// ─── Per-test state shape ─────────────────────────────────────────────────────
function idleResult() {
  return { status: 'idle', response: '', assertions: [], error: null, responseOpen: false };
}

// ─── Run a single test ────────────────────────────────────────────────────────
async function runTest({ test, sessions, responseFormat, delimiters, apiKeys, onUpdate }) {
  const session = sessions[0];
  const provider = getProvider(session.params.provider);
  const keyMap = { openAi: 'openai', anthropic: 'anthropic' };
  const apiKey = apiKeys[keyMap[session.params.provider] || session.params.provider];

  if (!apiKey) {
    onUpdate({ status: 'error', error: `No API key for "${session.params.provider}". Add one in Settings.` });
    return;
  }

  onUpdate({ status: 'running', response: '', assertions: [], error: null });

  // Inject test input variables into messages
  const testInput = test.input || {};
  const processedMessages = applyVariablesToMessages(session.messages, testInput, delimiters);

  let fullResponse = '';

  try {
    await provider.call({
      apiKey,
      params: session.params,
      messages: processedMessages,
      responseFormat,
      onChunk: (chunk) => {
        fullResponse += chunk;
        onUpdate({ status: 'running', response: fullResponse });
      },
      onDone: () => {},
      onError: (err) => { throw new Error(err); },
    });
  } catch (e) {
    onUpdate({ status: 'error', error: e.message, response: fullResponse });
    return;
  }

  // Parse response and build assertion list
  const expected = test.expected_output;

  // Smoke test — no assertions
  if (!expected || Object.keys(expected).length === 0) {
    onUpdate({ status: 'done', response: fullResponse, assertions: [] });
    return;
  }

  // Warn on _raw + json_schema mismatch
  const isJson = ['json_schema', 'json_object', 'json'].includes(responseFormat?.type);
  if (isJson && expected._raw) {
    onUpdate({
      status: 'done',
      response: fullResponse,
      assertions: [{
        path: '_raw',
        assertion: { type: 'exact', value: '' },
        actual: undefined,
        pass: false,
        details: 'Warning: _raw key is not valid for json_schema responses',
        pending: false,
      }],
    });
    return;
  }

  // Walk the expected tree against the parsed (or raw) actual response
  let actualParsed;
  if (isJson) {
    try {
      actualParsed = JSON.parse(fullResponse);
    } catch {
      onUpdate({
        status: 'error',
        response: fullResponse,
        error: 'Response is not valid JSON',
        assertions: [],
      });
      return;
    }
  } else {
    // text format: wrap raw string so _raw key works
    actualParsed = { _raw: fullResponse };
  }

  // Collect and evaluate all deterministic assertions
  let assertions = walkExpected(expected, actualParsed).map(evalDeterministic);

  // Publish initial results immediately (fuzzy ones are pending)
  onUpdate({ status: 'running', response: fullResponse, assertions: [...assertions] });

  // Evaluate fuzzy assertions via judge
  const openaiProvider = getProvider('openAi');
  const openaiKey = apiKeys['openai'];

  for (let i = 0; i < assertions.length; i++) {
    const r = assertions[i];
    if (!r.pending) continue;

    if (!openaiKey) {
      assertions[i] = {
        ...r,
        pending: false,
        pass: false,
        details: 'No OpenAI API key — cannot run fuzzy judge',
      };
      onUpdate({ status: 'running', response: fullResponse, assertions: [...assertions] });
      continue;
    }

    try {
      const judgeMessages = buildJudgeMessages(r.actual, r.assertion.criterion);
      let judgeRaw = '';
      await openaiProvider.call({
        apiKey: openaiKey,
        params: { provider: 'openAi', model: JUDGE_MODEL, temperature: 0, model_parameters: {} },
        messages: judgeMessages,
        responseFormat: { type: 'text' },
        onChunk: (chunk) => { judgeRaw += chunk; },
        onDone: () => {},
        onError: (err) => { throw new Error(err); },
      });

      const judgeResult = parseJudgeResponse(judgeRaw);
      assertions[i] = {
        ...r,
        pending: false,
        pass: !!judgeResult.pass,
        details: judgeResult.reason || null,
      };
    } catch (e) {
      assertions[i] = {
        ...r,
        pending: false,
        pass: false,
        details: `Judge error: ${e.message}`,
      };
    }

    onUpdate({ status: 'running', response: fullResponse, assertions: [...assertions] });
  }

  onUpdate({ status: 'done', response: fullResponse, assertions });
}

// ─── Assertion results table ──────────────────────────────────────────────────
function AssertionTable({ assertions }) {
  if (assertions.length === 0) {
    return html`<div class="tr-smoke">Smoke test — LLM call succeeded, no assertions defined.</div>`;
  }

  return html`
    <div class="tr-table-wrap">
      <table class="tr-table">
        <thead>
          <tr>
            <th>Field path</th>
            <th>Type</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          ${assertions.map((r, i) => html`
            <tr key=${i} class=${r.pending ? 'tr-row-pending' : r.pass ? 'tr-row-pass' : 'tr-row-fail'}>
              <td class="tr-cell-path">${r.path}</td>
              <td class="tr-cell-type">${r.assertion.type}</td>
              <td class="tr-cell-expected">${formatExpected(r.assertion)}</td>
              <td class="tr-cell-actual">${formatActual(r.actual)}</td>
              <td class="tr-cell-result">
                ${r.pending
                  ? html`<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>`
                  : r.pass
                    ? html`<span class="tr-badge pass">PASS</span>`
                    : html`<span class="tr-badge fail">FAIL</span>`
                }
                ${!r.pending && !r.pass && r.details && html`
                  <div class="tr-fail-reason">${r.details}</div>
                `}
              </td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Single test case row ─────────────────────────────────────────────────────
function TestCaseRow({ test, index, result, onRun }) {
  const passCount = result.assertions.filter((r) => r.pass === true).length;
  const totalCount = result.assertions.length;
  const isSmokeTest = result.status === 'done' && totalCount === 0;

  const overallPass =
    isSmokeTest ||
    (result.status === 'done' && totalCount > 0 && passCount === totalCount);

  const badge = result.status === 'idle'
    ? null
    : result.status === 'error'
      ? html`<span class="tr-badge fail">ERROR</span>`
      : result.status === 'running'
        ? html`<span class="spinner" style="width:11px;height:11px;border-width:1.5px"></span>`
        : isSmokeTest
          ? html`<span class="tr-badge pass">SMOKE PASS</span>`
          : html`<span class="tr-badge ${overallPass ? 'pass' : 'fail'}">${passCount}/${totalCount}</span>`;

  return html`
    <div class="tr-case">
      <div class="tr-case-header">
        <span class="tr-case-label">Test ${index + 1}</span>
        ${badge}
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button
            class="btn btn-primary btn-sm"
            onClick=${onRun}
            disabled=${result.status === 'running'}
          >
            ${result.status === 'running'
              ? html`<span class="spinner"></span>`
              : '▶'
            } Run
          </button>
        </div>
      </div>

      ${result.status !== 'idle' && html`
        <div class="tr-case-body">
          ${Object.keys(test.input || {}).length > 0 && html`
            <div class="tr-inputs">
              <div class="tr-section-label">Input variables</div>
              <div class="tr-input-grid">
                ${Object.entries(test.input).map(([k, v]) => html`
                  <div key=${k} class="tr-input-item">
                    <span class="tr-input-key">${k}</span>
                    <span class="tr-input-val">${String(v).length > 100 ? String(v).slice(0, 97) + '…' : String(v)}</span>
                  </div>
                `)}
              </div>
            </div>
          `}

          ${result.error && html`
            <div class="error-banner" style="margin:8px 0 0">${result.error}</div>
          `}

          ${(result.response || result.status === 'running') && html`
            <div class="tr-response-section">
              <button
                class="tr-section-label tr-toggle"
                onClick=${() => {/* handled by parent via result update — just using expandable below */}}
              >
                <span class="tr-section-label" style="cursor:default">LLM Response</span>
              </button>
              <details class="tr-response-details">
                <summary class="tr-response-summary">Show / hide response</summary>
                <pre class="tr-response-pre">${result.response}${result.status === 'running' ? html`<span class="cursor"></span>` : ''}</pre>
              </details>
            </div>
          `}

          <${AssertionTable} assertions=${result.assertions} />
        </div>
      `}
    </div>
  `;
}

// ─── Main TestRunner modal ────────────────────────────────────────────────────
export function TestRunner({ tests, sessions, responseFormat, delimiters, apiKeys, onClose }) {
  const [results, setResults] = useState(tests.map(() => idleResult()));
  const resultsRef = useRef(results);
  resultsRef.current = results;

  function updateResult(idx, patch) {
    setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleRun(idx) {
    await runTest({
      test: tests[idx],
      sessions,
      responseFormat,
      delimiters,
      apiKeys,
      onUpdate: (patch) => updateResult(idx, patch),
    });
  }

  async function handleRunAll() {
    for (let i = 0; i < tests.length; i++) {
      await handleRun(i);
    }
  }

  const doneResults = results.filter((r) => r.status === 'done');
  const passingCount = doneResults.filter((r) => {
    if (r.assertions.length === 0) return true; // smoke test
    return r.assertions.every((a) => a.pass === true);
  }).length;
  const anyRunning = results.some((r) => r.status === 'running');

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  if (tests.length === 0) {
    return html`
      <div class="modal-overlay" onClick=${handleOverlayClick}>
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <span class="modal-title">Test Runner</span>
            <button class="btn btn-ghost btn-sm" onClick=${onClose}>✕</button>
          </div>
          <div class="modal-body" style="text-align:center;color:var(--text-3);padding:40px">
            No test cases defined in this prompt file.
          </div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="modal-overlay" onClick=${handleOverlayClick}>
      <div class="modal fullscreen" role="dialog" aria-modal="true" aria-label="Test Runner">
        <div class="modal-header">
          <span class="modal-title">Test Runner</span>
          <div style="display:flex;align-items:center;gap:10px">
            ${doneResults.length > 0 && html`
              <span class="tr-summary ${passingCount === doneResults.length ? 'pass' : 'fail'}">
                ${passingCount} / ${doneResults.length} passing
              </span>
            `}
            <button
              class="btn btn-primary btn-sm"
              onClick=${handleRunAll}
              disabled=${anyRunning}
            >
              ${anyRunning ? html`<span class="spinner"></span>` : '▶▶'} Run all
            </button>
            <button class="btn btn-ghost btn-sm" onClick=${onClose}>✕</button>
          </div>
        </div>

        <div class="modal-body tr-body">
          ${tests.map((test, i) => html`
            <${TestCaseRow}
              key=${i}
              test=${test}
              index=${i}
              result=${results[i]}
              onRun=${() => handleRun(i)}
            />
          `)}
        </div>
      </div>
    </div>
  `;
}

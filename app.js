import { html, render, useState, useRef, useEffect } from './lib.js';
import { useLocalStorage } from './utils/storage.js';
import { normalizeMessages } from './utils/messages.js';
import { applyVariablesToMessages } from './utils/variables.js';
import { getProvider } from './providers/index.js';
import {
  walkExpected,
  evalDeterministic,
  buildJudgeMessages,
  parseJudgeResponse,
  stripJsonFences,
} from './utils/testRunner.js';
import { ApiKeyModal } from './components/ApiKeyModal.js';
import { FileLoader } from './components/FileLoader.js';
import { ParameterPanel } from './components/ParameterPanel.js';
import { MessageEditor } from './components/MessageEditor.js';
import { VariablePanel } from './components/VariablePanel.js';
import { ResponseDisplay } from './components/ResponseDisplay.js';
import { DiffViewer } from './components/DiffViewer.js';
import { SaveModal } from './components/SaveModal.js';

// ─── Service Worker ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ─── Default State ────────────────────────────────────────────────────────────
function defaultParams() {
  return {
    provider: 'openAi',
    model: 'gpt-4o',
    model_parameters: {},
  };
}

function defaultSession(params, messages) {
  return {
    params: params || defaultParams(),
    messages: messages || [],
    response: '',
    loading: false,
    error: null,
    usage: null,
    assertions: null,       // null = no tests loaded; [] = smoke test passed; [...] = results
    assertionsRunning: false,
  };
}

// ─── Pane (Split Mode) ────────────────────────────────────────────────────────
function Pane({ session, sessionIdx, label, paramKey, onUpdateSession, onRun, onSave, responseFormat }) {
  const [paramsOpen, setParamsOpen] = useState(false);

  return html`
    <div class="pane">
      <div class="pane-header">
        <span class="pane-label">Variant ${label}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-sm" onClick=${onSave} title="Save this variant as JSON">
            ↓ Save
          </button>
          <button class="btn btn-primary btn-sm" onClick=${onRun} disabled=${session.loading}>
            ${session.loading ? html`<span class="spinner"></span>` : '▶'} Run
          </button>
        </div>
      </div>

      <div class="pane-accordion">
        <button class="accordion-toggle" onClick=${() => setParamsOpen(!paramsOpen)}>
          ${paramsOpen ? '▾' : '▸'} Parameters — ${session.params.provider} / ${session.params.model}
        </button>
        ${paramsOpen && html`
          <div class="accordion-body">
            <${ParameterPanel}
              key=${paramKey}
              params=${session.params}
              onChange=${(params) => onUpdateSession(sessionIdx, { params })}
              compact=${true}
            />
          </div>
        `}
      </div>

      <div class="pane-messages">
        <${MessageEditor}
          messages=${session.messages}
          onChange=${(messages) => onUpdateSession(sessionIdx, { messages })}
        />
      </div>

      <div class="pane-response">
        ${session.error && html`<div class="error-banner">${session.error}</div>`}
        <${ResponseDisplay}
          response=${session.response}
          responseFormat=${responseFormat}
          loading=${session.loading}
          error=${null}
          usage=${session.usage}
          provider=${session.params.provider}
          assertions=${session.assertions}
          assertionsRunning=${session.assertionsRunning}
        />
      </div>
    </div>
  `;
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [apiKeys, setApiKeys] = useLocalStorage('prompt-playground-keys', { openai: '', anthropic: '' });
  const [mode, setMode] = useState('single');
  const [responseFormat, setResponseFormat] = useState({ type: 'text' });
  const [delimiters, setDelimiters] = useState(['<%', '%>']);
  const [templateName, setTemplateName] = useState('');
  const [variables, setVariables] = useState({});
  const [variableDefs, setVariableDefs] = useState([]);
  const [sessions, setSessions] = useState([defaultSession(), defaultSession()]);
  const [loadKey, setLoadKey] = useState(0);
  const [rawFileData, setRawFileData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalSessionIdx, setSaveModalSessionIdx] = useState(0);

  // Always-current snapshot for async callbacks
  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { sessions, apiKeys, variables, delimiters, responseFormat, rawFileData };
  });

  // ── File Loading ────────────────────────────────────────────────────────────
  function loadFile(data) {
    setRawFileData(data);

    const lp = data.llm_parameters || {};
    const STANDARD = new Set([
      'provider', 'model', 'temperature', 'max_completion_tokens', 'max_tokens',
      'top_p', 'frequency_penalty', 'presence_penalty', 'messages', 'model_parameters',
    ]);

    const modelParams = { ...(lp.model_parameters || {}) };
    for (const [k, v] of Object.entries(lp)) {
      if (!STANDARD.has(k)) modelParams[k] = v;
    }

    const params = {
      provider: lp.provider || 'openAi',
      model: lp.model || 'gpt-4o',
      model_parameters: modelParams,
    };
    if (lp.temperature != null)        params.temperature = lp.temperature;
    // Accept both the new name and the legacy name from older files
    const maxTok = lp.max_completion_tokens ?? lp.max_tokens;
    if (maxTok != null)                params.max_completion_tokens = maxTok;
    if (lp.top_p != null)              params.top_p = lp.top_p;
    if (lp.frequency_penalty != null)  params.frequency_penalty = lp.frequency_penalty;
    if (lp.presence_penalty != null)   params.presence_penalty = lp.presence_penalty;

    const messages = normalizeMessages(lp.messages || []);
    const defs = data.template_info?.input_variables?.[0]?.keys || [];

    const vars = {};
    defs.forEach((d) => { vars[d.name] = ''; });
    const perfInput = data.template_info?.performance_tests?.[0]?.input;
    if (perfInput) Object.assign(vars, perfInput);

    setVariableDefs(defs);
    setVariables(vars);
    setResponseFormat(data.response_format || { type: 'text' });
    setDelimiters(data.template_info?.input_delimiters || ['<%', '%>']);
    setTemplateName(data.template_info?.name || '');
    setLoadKey((k) => k + 1);

    const cloneMessages = (msgs) => msgs.map((m) => ({
      ...m,
      content: Array.isArray(m.content) ? [...m.content] : m.content,
    }));

    setSessions([
      defaultSession(params, cloneMessages(messages)),
      defaultSession({ ...params }, cloneMessages(messages)),
    ]);
  }

  // ── Save Modal ──────────────────────────────────────────────────────────────
  function openSaveModal(idx) {
    setSaveModalSessionIdx(idx);
    setShowSaveModal(true);
  }

  // ── Session Helpers ─────────────────────────────────────────────────────────
  function updateSession(idx, updates) {
    setSessions((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  }

  // ── Assertion Evaluation ────────────────────────────────────────────────────
  async function runAssertions(idx, fullResponse) {
    const snap = stateRef.current;
    const performanceTests = snap.rawFileData?.template_info?.performance_tests || [];
    if (!performanceTests.length) return;

    const expectedOutput = performanceTests[0]?.expected_output;
    if (expectedOutput === undefined || expectedOutput === null) return;

    // Empty expected_output = smoke test (LLM ran without error, no assertions to check)
    if (Object.keys(expectedOutput).length === 0) {
      updateSession(idx, { assertions: [], assertionsRunning: false });
      return;
    }

    const isJson = ['json_schema', 'json_object', 'json'].includes(snap.responseFormat?.type);
    let actualParsed;

    if (isJson) {
      try {
        actualParsed = JSON.parse(stripJsonFences(fullResponse));
      } catch {
        updateSession(idx, {
          assertions: [{
            path: '(parse error)',
            assertion: { type: 'missing' },
            actual: undefined,
            pass: false,
            details: 'Response is not valid JSON — cannot evaluate assertions',
            pending: false,
          }],
          assertionsRunning: false,
        });
        return;
      }
    } else {
      actualParsed = { _raw: fullResponse };
    }

    // Walk tree and evaluate deterministic assertions immediately
    let assertions = walkExpected(expectedOutput, actualParsed).map(evalDeterministic);
    const hasFuzzy = assertions.some((r) => r.pending);
    updateSession(idx, { assertions: [...assertions], assertionsRunning: hasFuzzy });

    if (!hasFuzzy) return;

    // Evaluate fuzzy assertions one by one, updating state after each
    const openaiProvider = getProvider('openAi');
    const openaiKey = snap.apiKeys?.openai;

    for (let i = 0; i < assertions.length; i++) {
      if (!assertions[i].pending) continue;

      if (!openaiKey) {
        assertions[i] = {
          ...assertions[i],
          pending: false,
          pass: false,
          details: 'No OpenAI API key — cannot run fuzzy judge',
        };
        updateSession(idx, {
          assertions: [...assertions],
          assertionsRunning: assertions.some((r) => r.pending),
        });
        continue;
      }

      try {
        const judgeMessages = buildJudgeMessages(assertions[i].actual, assertions[i].assertion.criterion);
        let judgeRaw = '';
        await openaiProvider.call({
          apiKey: openaiKey,
          params: { provider: 'openAi', model: 'gpt-5.4', temperature: 0, model_parameters: {} },
          messages: judgeMessages,
          responseFormat: { type: 'text' },
          onChunk: (chunk) => { judgeRaw += chunk; },
          onDone: () => {},
          onError: (err) => { throw new Error(err); },
        });
        const result = parseJudgeResponse(judgeRaw);
        assertions[i] = {
          ...assertions[i],
          pending: false,
          pass: !!result.pass,
          details: result.reason || null,
        };
      } catch (e) {
        assertions[i] = {
          ...assertions[i],
          pending: false,
          pass: false,
          details: `Judge error: ${e.message}`,
        };
      }

      updateSession(idx, {
        assertions: [...assertions],
        assertionsRunning: assertions.some((r) => r.pending),
      });
    }

    updateSession(idx, { assertionsRunning: false });
  }

  // ── Run ─────────────────────────────────────────────────────────────────────
  async function runSession(idx) {
    const { sessions: cur, apiKeys: curKeys, variables: curVars, delimiters: curDelims, responseFormat: curFmt } = stateRef.current;
    const s = cur[idx];
    const providerName = s.params.provider;
    const keyMap = { openAi: 'openai', anthropic: 'anthropic' };
    const apiKey = curKeys[keyMap[providerName] || providerName];

    if (!apiKey) {
      updateSession(idx, { error: `No API key for "${providerName}". Add one in Settings.`, loading: false });
      return;
    }

    const provider = getProvider(providerName);
    if (!provider) {
      updateSession(idx, { error: `Unknown provider: "${providerName}"`, loading: false });
      return;
    }

    const processedMessages = applyVariablesToMessages(s.messages, curVars, curDelims);
    updateSession(idx, { loading: true, response: '', error: null, usage: null, assertions: null, assertionsRunning: false });

    let accumulatedResponse = '';
    let hasError = false;

    await provider.call({
      apiKey,
      params: s.params,
      messages: processedMessages,
      responseFormat: curFmt,
      onChunk: (chunk) => {
        accumulatedResponse += chunk;
        setSessions((prev) =>
          prev.map((sess, i) => (i === idx ? { ...sess, response: sess.response + chunk } : sess))
        );
      },
      onDone: (usage) => {
        setSessions((prev) =>
          prev.map((sess, i) => (i === idx ? { ...sess, loading: false, usage } : sess))
        );
      },
      onError: (err) => {
        hasError = true;
        setSessions((prev) =>
          prev.map((sess, i) => (i === idx ? { ...sess, loading: false, error: err } : sess))
        );
      },
    });

    if (!hasError) {
      await runAssertions(idx, accumulatedResponse);
    }
  }

  function runBoth() {
    runSession(0);
    runSession(1);
  }

  // ── Mode Switch ─────────────────────────────────────────────────────────────
  function switchMode(newMode) {
    if (newMode === mode) return;
    if (newMode === 'split') {
      setSessions((prev) => {
        const s0 = prev[0];
        return [
          s0,
          {
            ...s0,
            messages: s0.messages.map((m) => ({
              ...m,
              content: Array.isArray(m.content) ? [...m.content] : m.content,
            })),
            response: '',
            loading: false,
            error: null,
            usage: null,
            assertions: null,
            assertionsRunning: false,
          },
        ];
      });
    }
    setMode(newMode);
  }

  const bothHaveResponses = sessions[0].response && sessions[1].response;
  const hasContent = sessions[0].messages.length > 0 || rawFileData;

  // ── Render ──────────────────────────────────────────────────────────────────
  return html`
    <div class="app">

      <header class="header">
        <div class="header-left">
          <${FileLoader} onLoad=${loadFile} />
          ${hasContent && html`
            <button class="btn btn-sm" onClick=${() => openSaveModal(0)} title="Download current prompt as JSON">
              ↓ Save
            </button>
          `}
          ${templateName && html`<span class="template-name">${templateName}</span>`}
        </div>
        <div class="header-center">
          <div class="mode-toggle">
            <button class=${'btn btn-sm' + (mode === 'single' ? ' active' : '')} onClick=${() => switchMode('single')}>Single</button>
            <button class=${'btn btn-sm' + (mode === 'split' ? ' active' : '')} onClick=${() => switchMode('split')}>Compare</button>
          </div>
        </div>
        <div class="header-right">
          ${mode === 'split' && html`
            <button
              class="btn btn-primary btn-sm"
              onClick=${runBoth}
              disabled=${sessions[0].loading || sessions[1].loading}
            >
              ${sessions[0].loading || sessions[1].loading ? html`<span class="spinner"></span>` : '▶▶'} Run both
            </button>
          `}
          <button class="btn btn-ghost btn-sm" onClick=${() => setShowSettings(true)}>⚙ Settings</button>
        </div>
      </header>

      <main class="main">
        ${mode === 'single' ? html`
          <div class="single-layout">
            <div class="sidebar">
              <${ParameterPanel}
                key=${loadKey}
                params=${sessions[0].params}
                onChange=${(params) => updateSession(0, { params })}
              />
              <div class="divider"></div>
              <${VariablePanel}
                variableDefs=${variableDefs}
                variables=${variables}
                onChange=${setVariables}
              />
            </div>

            <div class="messages-column">
              <${MessageEditor}
                messages=${sessions[0].messages}
                onChange=${(messages) => updateSession(0, { messages })}
              />
            </div>

            <div class="response-column">
              <div class="run-bar">
                <button
                  class="btn btn-primary"
                  onClick=${() => runSession(0)}
                  disabled=${sessions[0].loading}
                  style="width:100%"
                >
                  ${sessions[0].loading ? html`<span class="spinner"></span> Running…` : '▶ Run'}
                </button>
              </div>
              <${ResponseDisplay}
                response=${sessions[0].response}
                responseFormat=${responseFormat}
                loading=${sessions[0].loading}
                error=${sessions[0].error}
                usage=${sessions[0].usage}
                provider=${sessions[0].params.provider}
                assertions=${sessions[0].assertions}
                assertionsRunning=${sessions[0].assertionsRunning}
              />
            </div>
          </div>
        ` : html`
          <div class="split-layout">
            ${variableDefs.length > 0 && html`
              <div class="split-vars-bar">
                <${VariablePanel}
                  variableDefs=${variableDefs}
                  variables=${variables}
                  onChange=${setVariables}
                  inline=${true}
                />
              </div>
            `}

            <div class="split-panes" style="flex:1;overflow:hidden">
              <${Pane}
                session=${sessions[0]}
                sessionIdx=${0}
                label="A"
                paramKey=${loadKey}
                onUpdateSession=${updateSession}
                onRun=${() => runSession(0)}
                onSave=${() => openSaveModal(0)}
                responseFormat=${responseFormat}
              />
              <${Pane}
                session=${sessions[1]}
                sessionIdx=${1}
                label="B"
                paramKey=${loadKey}
                onUpdateSession=${updateSession}
                onRun=${() => runSession(1)}
                onSave=${() => openSaveModal(1)}
                responseFormat=${responseFormat}
              />
            </div>

            ${bothHaveResponses && html`
              <div class="diff-bar">
                <button class="btn btn-ghost btn-sm" onClick=${() => setShowDiff(true)}>◑ Compare outputs</button>
              </div>
            `}
          </div>
        `}
      </main>

      ${showSettings && html`
        <${ApiKeyModal}
          apiKeys=${apiKeys}
          onSave=${(keys) => { setApiKeys(keys); setShowSettings(false); }}
          onClose=${() => setShowSettings(false)}
        />
      `}

      ${showDiff && html`
        <${DiffViewer}
          textA=${sessions[0].response}
          textB=${sessions[1].response}
          labelA="A"
          labelB="B"
          onClose=${() => setShowDiff(false)}
        />
      `}

      ${showSaveModal && html`
        <${SaveModal}
          rawFileData=${rawFileData}
          sessionIdx=${saveModalSessionIdx}
          sessionLabel=${mode === 'split' ? (saveModalSessionIdx === 0 ? 'A' : 'B') : null}
          sessions=${sessions}
          responseFormat=${responseFormat}
          variables=${variables}
          onClose=${() => setShowSaveModal(false)}
        />
      `}
    </div>
  `;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
render(html`<${App} />`, document.getElementById('root'));

import { html, render, useState, useRef, useEffect } from './lib.js';
import { useLocalStorage } from './utils/storage.js';
import { normalizeMessages } from './utils/messages.js';
import { applyVariablesToMessages } from './utils/variables.js';
import { getProvider } from './providers/index.js';
import { ApiKeyModal } from './components/ApiKeyModal.js';
import { FileLoader } from './components/FileLoader.js';
import { ParameterPanel } from './components/ParameterPanel.js';
import { MessageEditor } from './components/MessageEditor.js';
import { VariablePanel } from './components/VariablePanel.js';
import { ResponseDisplay } from './components/ResponseDisplay.js';
import { DiffViewer } from './components/DiffViewer.js';

// ─── Service Worker ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ─── Default State ────────────────────────────────────────────────────────────
function defaultParams() {
  // Only required fields — all sampling params start as undefined (not sent to API)
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
  };
}

// ─── Pane (Split Mode) ────────────────────────────────────────────────────────
function Pane({ session, sessionIdx, label, paramKey, onUpdateSession, onRun, responseFormat }) {
  const [paramsOpen, setParamsOpen] = useState(false);

  return html`
    <div class="pane">
      <div class="pane-header">
        <span class="pane-label">Variant ${label}</span>
        <button class="btn btn-primary btn-sm" onClick=${onRun} disabled=${session.loading}>
          ${session.loading ? html`<span class="spinner"></span>` : '▶'} Run
        </button>
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

  // Always-current snapshot for async callbacks
  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { sessions, apiKeys, variables, delimiters, responseFormat };
  });

  // ── File Loading ────────────────────────────────────────────────────────────
  function loadFile(data) {
    setRawFileData(data);

    const lp = data.llm_parameters || {};
    const STANDARD = new Set([
      'provider', 'model', 'temperature', 'max_tokens', 'top_p',
      'frequency_penalty', 'presence_penalty', 'messages', 'model_parameters',
    ]);

    // Hoist any non-standard top-level llm_parameters keys into model_parameters
    const modelParams = { ...(lp.model_parameters || {}) };
    for (const [k, v] of Object.entries(lp)) {
      if (!STANDARD.has(k)) modelParams[k] = v;
    }

    // Only include sampling params that are explicitly present in the JSON
    const params = {
      provider: lp.provider || 'openAi',
      model: lp.model || 'gpt-4o',
      model_parameters: modelParams,
    };
    if (lp.temperature != null)        params.temperature = lp.temperature;
    if (lp.max_tokens != null)         params.max_tokens = lp.max_tokens;
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

  // ── Download JSON ───────────────────────────────────────────────────────────
  function downloadJson() {
    const s = sessions[0];

    // Build on top of the original file data so all metadata is preserved
    const base = rawFileData
      ? JSON.parse(JSON.stringify(rawFileData))
      : { template_info: { name: templateName || 'untitled' }, response_format: { type: 'text' } };

    // Reconstruct llm_parameters from current state
    const lp = { provider: s.params.provider, model: s.params.model };
    if (s.params.temperature !== undefined)       lp.temperature = s.params.temperature;
    if (s.params.max_tokens !== undefined)        lp.max_tokens = s.params.max_tokens;
    if (s.params.top_p !== undefined)             lp.top_p = s.params.top_p;
    if (s.params.frequency_penalty !== undefined) lp.frequency_penalty = s.params.frequency_penalty;
    if (s.params.presence_penalty !== undefined)  lp.presence_penalty = s.params.presence_penalty;
    if (Object.keys(s.params.model_parameters || {}).length > 0) {
      lp.model_parameters = s.params.model_parameters;
    }
    lp.messages = s.messages;

    base.llm_parameters = lp;
    base.response_format = responseFormat;

    // Update performance_tests with current variable values
    if (base.template_info && Object.keys(variables).length > 0) {
      if (!base.template_info.performance_tests) base.template_info.performance_tests = [];
      if (base.template_info.performance_tests.length > 0) {
        base.template_info.performance_tests[0].input = { ...variables };
      } else {
        base.template_info.performance_tests.push({ input: { ...variables }, expected_output: '' });
      }
    }

    const slug = (base.template_info?.name || 'prompt-template')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const blob = new Blob([JSON.stringify(base, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = slug + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Session Helpers ─────────────────────────────────────────────────────────
  function updateSession(idx, updates) {
    setSessions((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
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
    updateSession(idx, { loading: true, response: '', error: null, usage: null });

    await provider.call({
      apiKey,
      params: s.params,
      messages: processedMessages,
      responseFormat: curFmt,
      onChunk: (chunk) => {
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
        setSessions((prev) =>
          prev.map((sess, i) => (i === idx ? { ...sess, loading: false, error: err } : sess))
        );
      },
    });
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
            <button class="btn btn-sm" onClick=${downloadJson} title="Download current prompt as JSON">
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
                responseFormat=${responseFormat}
              />
              <${Pane}
                session=${sessions[1]}
                sessionIdx=${1}
                label="B"
                paramKey=${loadKey}
                onUpdateSession=${updateSession}
                onRun=${() => runSession(1)}
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
    </div>
  `;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
render(html`<${App} />`, document.getElementById('root'));

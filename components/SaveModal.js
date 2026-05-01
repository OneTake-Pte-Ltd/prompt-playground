import { html, useState, useEffect } from '../lib.js';

// Pure function — builds the final JSON structure from raw file data + edits + session state.
export function buildJsonOutput({ rawFileData, session, responseFormat, variables, templateInfoOverride }) {
  const base = rawFileData
    ? JSON.parse(JSON.stringify(rawFileData))
    : { template_info: { name: 'untitled' }, response_format: { type: 'text' } };

  // Apply template_info overrides
  if (templateInfoOverride) {
    base.template_info = templateInfoOverride;
  }

  // Reconstruct llm_parameters from session state
  const lp = { provider: session.params.provider, model: session.params.model };
  if (session.params.temperature !== undefined)       lp.temperature = session.params.temperature;
  if (session.params.max_tokens !== undefined)        lp.max_tokens = session.params.max_tokens;
  if (session.params.top_p !== undefined)             lp.top_p = session.params.top_p;
  if (session.params.frequency_penalty !== undefined) lp.frequency_penalty = session.params.frequency_penalty;
  if (session.params.presence_penalty !== undefined)  lp.presence_penalty = session.params.presence_penalty;
  if (Object.keys(session.params.model_parameters || {}).length > 0) {
    lp.model_parameters = session.params.model_parameters;
  }
  lp.messages = session.messages;

  base.llm_parameters = lp;
  base.response_format = responseFormat;

  // Update performance_tests[0].input with current variable values
  if (base.template_info && Object.keys(variables).length > 0) {
    if (!base.template_info.performance_tests) base.template_info.performance_tests = [];
    if (base.template_info.performance_tests.length > 0) {
      base.template_info.performance_tests[0].input = { ...variables };
    } else {
      base.template_info.performance_tests.push({ input: { ...variables }, expected_output: {} });
    }
  }

  return base;
}

function triggerDownload(obj, name) {
  const slug = (name || 'prompt-template')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = slug + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SaveModal({ rawFileData, sessionIdx, sessionLabel, sessions, responseFormat, variables, onClose }) {
  const ti = rawFileData?.template_info || {};

  const [name, setName] = useState(ti.name || '');
  const [id, setId] = useState(ti.id || '');
  const [description, setDescription] = useState(ti.description || '');
  const [playgroundPromptId, setPlaygroundPromptId] = useState(ti.playground_prompt_id || '');

  // Advanced: full template_info as editable JSON (excludes the 4 simple fields above)
  const [advancedJson, setAdvancedJson] = useState('');
  const [advancedError, setAdvancedError] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    // Build the "rest" of template_info excluding the simple fields shown above
    const { name: _n, id: _i, description: _d, playground_prompt_id: _p, ...rest } = ti;
    setAdvancedJson(JSON.stringify(rest, null, 2));
  }, []);

  function buildTemplateInfo() {
    let rest = {};
    try {
      rest = JSON.parse(advancedJson);
    } catch {
      // If invalid JSON in advanced area, use the original
      const { name: _n, id: _i, description: _d, playground_prompt_id: _p, ...orig } = ti;
      rest = orig;
    }
    const result = { ...rest, name, id };
    if (description) result.description = description;
    if (playgroundPromptId) result.playground_prompt_id = playgroundPromptId;
    return result;
  }

  function handleAdvancedChange(val) {
    setAdvancedJson(val);
    try {
      JSON.parse(val);
      setAdvancedError(null);
    } catch (e) {
      setAdvancedError(e.message);
    }
  }

  function handleDownload() {
    const templateInfoOverride = buildTemplateInfo();
    const obj = buildJsonOutput({
      rawFileData,
      session: sessions[sessionIdx],
      responseFormat,
      variables,
      templateInfoOverride,
    });
    triggerDownload(obj, name);
    onClose();
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const label = sessionLabel != null ? ` — Variant ${sessionLabel}` : '';

  return html`
    <div class="modal-overlay" onClick=${handleOverlayClick}>
      <div class="modal wide" role="dialog" aria-modal="true">
        <div class="modal-header">
          <span class="modal-title">Save as JSON${label}</span>
          <button class="btn btn-ghost btn-sm" onClick=${onClose}>✕</button>
        </div>

        <div class="modal-body">
          <div class="save-form">

            <div class="save-field-row">
              <div class="save-field">
                <label class="param-label">Name</label>
                <input
                  class="input"
                  type="text"
                  value=${name}
                  placeholder="e.g. ViralityScore"
                  onInput=${(e) => setName(e.target.value)}
                />
              </div>
              <div class="save-field">
                <label class="param-label">ID (kebab-case)</label>
                <input
                  class="input"
                  type="text"
                  value=${id}
                  placeholder="e.g. virality-score"
                  onInput=${(e) => setId(e.target.value)}
                />
              </div>
            </div>

            <div class="save-field" style="margin-top:10px">
              <label class="param-label">Description</label>
              <textarea
                class="textarea save-description"
                value=${description}
                placeholder="What does this prompt do?"
                onInput=${(e) => setDescription(e.target.value)}
              ></textarea>
            </div>

            <div class="save-field" style="margin-top:10px">
              <label class="param-label">Playground Prompt ID</label>
              <input
                class="input"
                type="text"
                value=${playgroundPromptId}
                placeholder="pmpt_..."
                onInput=${(e) => setPlaygroundPromptId(e.target.value)}
              />
            </div>

            <div class="save-advanced" style="margin-top:14px">
              <button
                class="accordion-toggle"
                style="width:100%;background:var(--bg-3);border-radius:var(--radius-sm);padding:6px 10px"
                onClick=${() => setAdvancedOpen(!advancedOpen)}
              >
                ${advancedOpen ? '▾' : '▸'} Advanced — remaining template_info fields (JSON)
              </button>
              ${advancedOpen && html`
                <div style="margin-top:6px">
                  ${advancedError && html`
                    <div class="error-banner" style="margin:0 0 6px">${advancedError}</div>
                  `}
                  <textarea
                    class="textarea save-advanced-json"
                    spellcheck="false"
                    value=${advancedJson}
                    onInput=${(e) => handleAdvancedChange(e.target.value)}
                  ></textarea>
                </div>
              `}
            </div>

          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-sm" onClick=${onClose}>Cancel</button>
          <button class="btn btn-primary btn-sm" onClick=${handleDownload} disabled=${!!advancedError}>
            ↓ Download JSON
          </button>
        </div>
      </div>
    </div>
  `;
}

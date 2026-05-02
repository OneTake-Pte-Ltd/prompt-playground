import { html, useState, useEffect } from '../lib.js';

const OPENAI_MODELS = [
  'gpt-5.5', 'gpt-5.5-pro',
  'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'gpt-5-mini', 'gpt-5-nano', 'gpt-5',
  'gpt-4.1', 'gpt-4o', 'gpt-4o-mini',
  'o1', 'o1-mini', 'o3-mini',
];

const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

// Slider + number input for an optional numeric param.
// When undefined the row shows a muted "not set" label with an Add button.
function OptionalSlider({ label, field, params, onChange, min, max, step, defaultVal }) {
  const isSet = params[field] !== undefined;

  function add() { onChange({ ...params, [field]: defaultVal }); }
  function remove() {
    const next = { ...params };
    delete next[field];
    onChange(next);
  }
  function set(v) { onChange({ ...params, [field]: v }); }

  return html`
    <div class="param-row full">
      <div class="param-group">
        <div class="param-label-row">
          <span class="param-label">${label}</span>
          ${isSet
            ? html`<button class="param-opt-btn remove" onClick=${remove} title="Remove">×</button>`
            : html`<button class="param-opt-btn add" onClick=${add}>+ Add</button>`
          }
        </div>
        ${isSet && html`
          <div class="param-slider-row">
            <input
              type="range" min=${min} max=${max} step=${step} value=${params[field]}
              onInput=${(e) => set(parseFloat(e.target.value))}
            />
            <input
              type="number" min=${min} max=${max} step=${step} value=${params[field]}
              onInput=${(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) set(v); }}
            />
          </div>
        `}
      </div>
    </div>
  `;
}

// Integer input (no slider) for an optional integer param.
function OptionalInt({ label, field, params, onChange, defaultVal, min = 1, max = 200000 }) {
  const isSet = params[field] !== undefined;

  function add() { onChange({ ...params, [field]: defaultVal }); }
  function remove() {
    const next = { ...params };
    delete next[field];
    onChange(next);
  }

  return html`
    <div class="param-row full">
      <div class="param-group">
        <div class="param-label-row">
          <span class="param-label">${label}</span>
          ${isSet
            ? html`<button class="param-opt-btn remove" onClick=${remove} title="Remove">×</button>`
            : html`<button class="param-opt-btn add" onClick=${add}>+ Add</button>`
          }
        </div>
        ${isSet && html`
          <input
            class="input"
            type="number"
            min=${min}
            max=${max}
            step="1"
            style="width:100%"
            value=${params[field]}
            onInput=${(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= min) onChange({ ...params, [field]: v });
            }}
          />
        `}
      </div>
    </div>
  `;
}

export function ParameterPanel({ params, onChange, compact = false }) {
  const isAnthropic = params.provider === 'anthropic';
  const listId = params.provider === 'anthropic' ? 'models-anthropic' : 'models-openai';

  // Local state for the model_parameters JSON textarea
  const [mpText, setMpText] = useState(() => JSON.stringify(params.model_parameters || {}, null, 2));
  const [mpError, setMpError] = useState('');

  // Sync on remount (parent uses `key` prop on file load)
  useEffect(() => {
    setMpText(JSON.stringify(params.model_parameters || {}, null, 2));
    setMpError('');
  }, []);

  function handleMpChange(text) {
    setMpText(text);
    try {
      const parsed = JSON.parse(text);
      setMpError('');
      onChange({ ...params, model_parameters: parsed });
    } catch {
      setMpError('Invalid JSON');
    }
  }

  return html`
    <div class=${'param-panel' + (compact ? ' compact' : '')}>
      <div class="section-label">Parameters</div>

      <!-- Provider -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">Provider</div>
          <select class="select" value=${params.provider} onChange=${(e) => onChange({ ...params, provider: e.target.value })}>
            <option value="openAi">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
      </div>

      <!-- Model -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">Model</div>
          <input
            class="input"
            list=${listId}
            value=${params.model}
            onInput=${(e) => onChange({ ...params, model: e.target.value })}
            placeholder="Model name…"
          />
          <datalist id="models-openai">
            ${OPENAI_MODELS.map((m) => html`<option key=${m} value=${m} />`)}
          </datalist>
          <datalist id="models-anthropic">
            ${ANTHROPIC_MODELS.map((m) => html`<option key=${m} value=${m} />`)}
          </datalist>
        </div>
      </div>

      <${OptionalSlider} label="Temperature" field="temperature" params=${params} onChange=${onChange} min=${0} max=${2} step=${0.01} defaultVal=${1} />
      <${OptionalInt}    label="Max completion tokens"  field="max_completion_tokens"  params=${params} onChange=${onChange} defaultVal=${2048} />
      <${OptionalSlider} label="Top P"       field="top_p"       params=${params} onChange=${onChange} min=${0} max=${1} step=${0.01} defaultVal=${1} />

      ${!isAnthropic && html`
        <${OptionalSlider} label="Frequency penalty" field="frequency_penalty" params=${params} onChange=${onChange} min=${-2} max=${2} step=${0.01} defaultVal=${0} />
        <${OptionalSlider} label="Presence penalty"  field="presence_penalty"  params=${params} onChange=${onChange} min=${-2} max=${2} step=${0.01} defaultVal=${0} />
      `}

      <!-- Extra model parameters (JSON) -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">
            Extra params
            ${mpError && html`<span style="color:var(--error);margin-left:6px;font-weight:400">${mpError}</span>`}
          </div>
          <textarea
            class=${'textarea model-params-area' + (mpError ? ' error' : '')}
            rows="4"
            spellcheck="false"
            onChange=${(e) => handleMpChange(e.target.value)}
          >${mpText}</textarea>
        </div>
      </div>
    </div>
  `;
}

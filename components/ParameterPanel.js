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

function modelListId(provider) {
  return provider === 'anthropic' ? 'models-anthropic' : 'models-openai';
}

export function ParameterPanel({ params, onChange, compact = false }) {
  const isAnthropic = params.provider === 'anthropic';
  const listId = modelListId(params.provider);

  // Local state for the model_parameters JSON textarea
  const [mpText, setMpText] = useState(() =>
    JSON.stringify(params.model_parameters || {}, null, 2)
  );
  const [mpError, setMpError] = useState('');

  // Sync when params reset from outside (file load via key prop remount)
  useEffect(() => {
    setMpText(JSON.stringify(params.model_parameters || {}, null, 2));
    setMpError('');
  }, []); // only on mount; parent uses `key` prop to remount on file load

  function set(field, value) {
    onChange({ ...params, [field]: value });
  }

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

  function numField(field, min, max, step = 0.01) {
    return html`
      <div class="param-slider-row">
        <input
          type="range"
          min=${min}
          max=${max}
          step=${step}
          value=${params[field] ?? min}
          onInput=${(e) => set(field, parseFloat(e.target.value))}
        />
        <input
          type="number"
          min=${min}
          max=${max}
          step=${step}
          value=${params[field] ?? min}
          onInput=${(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) set(field, v);
          }}
        />
      </div>
    `;
  }

  return html`
    <div class=${'param-panel' + (compact ? ' compact' : '')}>
      <div class="section-label">Parameters</div>

      <!-- Provider -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">Provider</div>
          <select
            class="select"
            value=${params.provider}
            onChange=${(e) => set('provider', e.target.value)}
          >
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
            onInput=${(e) => set('model', e.target.value)}
            placeholder="Model name..."
          />
          <datalist id="models-openai">
            ${OPENAI_MODELS.map((m) => html`<option key=${m} value=${m} />`)}
          </datalist>
          <datalist id="models-anthropic">
            ${ANTHROPIC_MODELS.map((m) => html`<option key=${m} value=${m} />`)}
          </datalist>
        </div>
      </div>

      <!-- Temperature -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">Temperature</div>
          ${numField('temperature', 0, 2, 0.01)}
        </div>
      </div>

      <!-- Max Tokens -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">Max tokens</div>
          <input
            class="input"
            type="number"
            min="1"
            max="200000"
            step="1"
            style="width:100%"
            value=${params.max_tokens ?? 2048}
            onInput=${(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > 0) set('max_tokens', v);
            }}
          />
        </div>
      </div>

      <!-- Top P -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">Top P</div>
          ${numField('top_p', 0, 1, 0.01)}
        </div>
      </div>

      ${!isAnthropic && html`
        <!-- Frequency Penalty -->
        <div class="param-row full">
          <div class="param-group">
            <div class="param-label">Frequency penalty</div>
            ${numField('frequency_penalty', -2, 2, 0.01)}
          </div>
        </div>

        <!-- Presence Penalty -->
        <div class="param-row full">
          <div class="param-group">
            <div class="param-label">Presence penalty</div>
            ${numField('presence_penalty', -2, 2, 0.01)}
          </div>
        </div>
      `}

      <!-- Model Parameters (extra JSON) -->
      <div class="param-row full">
        <div class="param-group">
          <div class="param-label">
            Extra params
            ${mpError && html`<span style="color:var(--error);margin-left:6px">${mpError}</span>`}
          </div>
          <textarea
            class=${'textarea model-params-area' + (mpError ? ' error' : '')}
            rows="4"
            spellcheck="false"
            value=${mpText}
            onInput=${(e) => handleMpChange(e.target.value)}
          ></textarea>
        </div>
      </div>
    </div>
  `;
}

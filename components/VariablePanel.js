import { html, useState, useRef, useEffect } from '../lib.js';

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function VarInput({ def, value, onChange }) {
  const ref = useRef(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonError, setJsonError] = useState(null);

  useEffect(() => { autoResize(ref.current); }, [value]);

  if (def.type === 'number') {
    return html`
      <input
        class="input"
        type="number"
        value=${value}
        placeholder=${def.name}
        onInput=${(e) => onChange(e.target.value)}
      />
    `;
  }

  // Object-type variables can be toggled to a JSON-formatted view
  if (def.type === 'object') {
    function toggleJson() {
      if (!jsonMode) {
        // Switching into JSON mode: pretty-print if valid, else leave as-is
        try {
          const pretty = JSON.stringify(JSON.parse(value), null, 2);
          onChange(pretty);
          setJsonError(null);
        } catch {
          setJsonError(null);
        }
        setJsonMode(true);
      } else {
        setJsonMode(false);
        setJsonError(null);
      }
    }

    function handleChange(text) {
      onChange(text);
      if (jsonMode) {
        try { JSON.parse(text); setJsonError(null); }
        catch (e) { setJsonError(e.message); }
      }
    }

    return html`
      <div class="var-json-wrap">
        <textarea
          ref=${ref}
          class=${'var-textarea' + (jsonMode ? ' var-textarea-json' : '') + (jsonError ? ' var-textarea-json-err' : '')}
          value=${value}
          placeholder=${def.name}
          spellcheck="false"
          onInput=${(e) => { autoResize(e.target); handleChange(e.target.value); }}
        ></textarea>
        <div class="var-json-bar">
          ${jsonError && html`<span class="var-json-error">${jsonError}</span>`}
          <button class="btn btn-ghost btn-xs" style="margin-left:auto" onClick=${toggleJson}>
            ${jsonMode ? 'Raw' : 'JSON'}
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <textarea
      ref=${ref}
      class="var-textarea"
      value=${value}
      placeholder=${def.name}
      spellcheck="false"
      onInput=${(e) => { autoResize(e.target); onChange(e.target.value); }}
    ></textarea>
  `;
}

export function VariablePanel({ variableDefs, variables, onChange, inline = false }) {
  if (!variableDefs || variableDefs.length === 0) {
    if (inline) return null;
    return html`
      <div class="var-panel">
        <div class="section-label">Variables</div>
        <div class="var-empty">No variables defined in this template</div>
      </div>
    `;
  }

  function set(name, value) {
    onChange({ ...variables, [name]: value });
  }

  if (inline) {
    return html`
      <div class="var-panel-inline">
        ${variableDefs.map((def) => html`
          <div key=${def.name} class="var-item">
            <div class="var-label">${def.name}</div>
            <${VarInput}
              def=${def}
              value=${variables[def.name] ?? ''}
              onChange=${(v) => set(def.name, v)}
            />
          </div>
        `)}
      </div>
    `;
  }

  return html`
    <div class="var-panel">
      <div class="section-label">Variables</div>
      ${variableDefs.map((def) => html`
        <div key=${def.name} class="var-item">
          <div class="var-label">${def.name}</div>
          <${VarInput}
            def=${def}
            value=${variables[def.name] ?? ''}
            onChange=${(v) => set(def.name, v)}
          />
        </div>
      `)}
    </div>
  `;
}

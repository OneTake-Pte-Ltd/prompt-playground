import { html, useRef, useEffect } from '../lib.js';

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function VarInput({ def, value, onChange }) {
  const ref = useRef(null);

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

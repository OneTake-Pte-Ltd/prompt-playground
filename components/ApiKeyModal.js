import { html, useState } from '../lib.js';

export function ApiKeyModal({ apiKeys, onSave, onClose }) {
  const [keys, setKeys] = useState({ ...apiKeys });

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose();
  }

  function set(provider, value) {
    setKeys((prev) => ({ ...prev, [provider]: value }));
  }

  return html`
    <div class="modal-overlay" onKeyDown=${handleKeyDown} onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="modal-header">
          <span class="modal-title">Settings</span>
          <button class="btn btn-ghost btn-sm" onClick=${onClose}>✕</button>
        </div>
        <div class="modal-body">
          <div class="api-key-group">
            <label class="api-key-label" htmlFor="key-openai">OpenAI API Key</label>
            <input
              id="key-openai"
              class="input"
              type="password"
              placeholder="sk-..."
              value=${keys.openai || ''}
              onInput=${(e) => set('openai', e.target.value)}
            />
            <div class="api-key-hint">Used for gpt-* and o* models</div>
          </div>
          <div class="api-key-group">
            <label class="api-key-label" htmlFor="key-anthropic">Anthropic API Key</label>
            <input
              id="key-anthropic"
              class="input"
              type="password"
              placeholder="sk-ant-..."
              value=${keys.anthropic || ''}
              onInput=${(e) => set('anthropic', e.target.value)}
            />
            <div class="api-key-hint">Used for claude-* models</div>
          </div>
          <div class="api-key-hint" style="margin-top:4px">
            Keys are stored only in your browser's localStorage and never sent to any server other than the respective provider API.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" onClick=${onClose}>Cancel</button>
          <button class="btn btn-primary" onClick=${() => onSave(keys)}>Save</button>
        </div>
      </div>
    </div>
  `;
}

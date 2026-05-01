import { html, useState, useRef } from '../lib.js';

export function FileLoader({ onLoad }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setError('');
        onLoad(data);
      } catch {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  function handleChange(e) {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  }

  return html`
    <div class="flex items-center gap-2">
      <input
        ref=${inputRef}
        type="file"
        accept=".json,application/json"
        class="hidden"
        onChange=${handleChange}
      />
      <button
        class="btn btn-sm"
        onClick=${() => inputRef.current?.click()}
        title="Load a prompt template JSON file"
      >
        Load file
      </button>
      ${error && html`<span style="color:var(--error);font-size:11px">${error}</span>`}
    </div>
  `;
}

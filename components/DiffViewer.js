import { html, useState } from '../lib.js';
import { diffLines, diffWords } from 'diff';

export function DiffViewer({ textA, textB, labelA = 'A', labelB = 'B', onClose }) {
  const [mode, setMode] = useState('lines'); // 'lines' | 'words'

  const parts = mode === 'lines'
    ? diffLines(textA || '', textB || '')
    : diffWords(textA || '', textB || '');

  const hasChanges = parts.some((p) => p.added || p.removed);

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose();
  }

  return html`
    <div class="modal-overlay" onClick=${handleOverlayClick} onKeyDown=${handleKeyDown}>
      <div class="modal fullscreen" role="dialog" aria-modal="true" aria-label="Compare outputs">
        <div class="modal-header">
          <span class="modal-title">Compare outputs</span>
          <div class="flex items-center gap-2">
            <div class="mode-toggle">
              <button
                class=${'btn btn-sm' + (mode === 'lines' ? ' active' : '')}
                onClick=${() => setMode('lines')}
              >Lines</button>
              <button
                class=${'btn btn-sm' + (mode === 'words' ? ' active' : '')}
                onClick=${() => setMode('words')}
              >Words</button>
            </div>
            <button class="btn btn-ghost btn-sm" onClick=${onClose}>✕</button>
          </div>
        </div>

        <div class="modal-body">
          <div class="diff-controls">
            <span style="font-size:11px;color:var(--text-3)">
              Comparing variant ${labelA} → variant ${labelB}
            </span>
          </div>

          ${!hasChanges
            ? html`<div class="diff-empty">No differences found between the two outputs.</div>`
            : html`
              <div class="diff-content">
                ${parts.map((part, i) => {
                  const lines = part.value.split('\n');
                  // Remove trailing empty string from split
                  if (lines[lines.length - 1] === '') lines.pop();

                  return lines.map((line, j) => html`
                    <div
                      key=${`${i}-${j}`}
                      class=${'diff-line' + (part.added ? ' added' : part.removed ? ' removed' : ' equal')}
                    >
                      <span class="diff-marker">${part.added ? '+' : part.removed ? '-' : ' '}</span>
                      <span class="diff-text">${line || ' '}</span>
                    </div>
                  `);
                })}
              </div>
            `
          }
        </div>
      </div>
    </div>
  `;
}

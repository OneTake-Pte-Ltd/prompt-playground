import { html, useState, useRef, useEffect } from '../lib.js';

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function TextBlock({ block, onChange, onRemove }) {
  const ref = useRef(null);

  useEffect(() => { autoResize(ref.current); }, [block.text]);

  return html`
    <div class="content-block">
      <div class="block-header">
        Text
        ${onRemove && html`
          <div class="block-actions">
            <button class="btn btn-ghost btn-xs btn-danger" onClick=${onRemove}>Remove</button>
          </div>
        `}
      </div>
      <textarea
        ref=${ref}
        class="block-textarea"
        value=${block.text}
        placeholder="Text content..."
        spellcheck="false"
        onInput=${(e) => { autoResize(e.target); onChange({ ...block, text: e.target.value }); }}
      ></textarea>
    </div>
  `;
}

function ImageBlock({ block, onChange, onRemove }) {
  const fileRef = useRef(null);
  const url = block.image_url?.url || '';
  const isData = url.startsWith('data:');

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange({ type: 'image_url', image_url: { url: ev.target.result } });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return html`
    <div class="content-block">
      <div class="block-header">
        Image
        <div class="block-actions">
          <button class="btn btn-ghost btn-xs btn-danger" onClick=${onRemove}>Remove</button>
        </div>
      </div>
      <div class="image-block-body">
        ${isData
          ? html`<img class="image-preview" src=${url} alt="preview" />`
          : html`<div class="image-preview" style="display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:10px;background:var(--bg-3)">No preview</div>`
        }
        <div class="image-info">
          <div class="image-label">${isData ? 'Local file (base64)' : 'URL'}</div>
          ${!isData && html`<div class="image-url-text">${url}</div>`}
          <input
            ref=${fileRef}
            type="file"
            accept="image/*"
            class="hidden"
            onChange=${handleFile}
          />
          <button
            class="btn btn-ghost btn-xs"
            style="margin-top:6px"
            onClick=${() => fileRef.current?.click()}
          >
            Replace with local file
          </button>
        </div>
      </div>
    </div>
  `;
}

function MessageItem({ message, onChangeContent, onChangeRole, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const textareaRef = useRef(null);
  const addImageRef = useRef(null);
  const isArray = Array.isArray(message.content);

  useEffect(() => {
    if (!isArray) autoResize(textareaRef.current);
  }, [message.content, isArray]);

  function handleAddImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageBlock = { type: 'image_url', image_url: { url: e.target.result } };
      if (isArray) {
        onChangeContent([...message.content, imageBlock]);
      } else {
        onChangeContent([{ type: 'text', text: message.content }, imageBlock]);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleAddTextBlock() {
    if (isArray) {
      onChangeContent([...message.content, { type: 'text', text: '' }]);
    }
  }

  function handleConvertToPlain() {
    if (!isArray) return;
    const hasImages = message.content.some((b) => b.type === 'image_url' || b.type === 'image');
    if (hasImages && !confirm('This will remove all image blocks. Continue?')) return;
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    onChangeContent(text);
  }

  function updateBlock(idx, block) {
    const next = [...message.content];
    next[idx] = block;
    onChangeContent(next);
  }

  function removeBlock(idx) {
    const next = message.content.filter((_, i) => i !== idx);
    onChangeContent(next.length === 0 ? '' : next);
  }

  return html`
    <div class="message-item">
      <div class="message-header">
        <select
          class="role-select"
          value=${message.role}
          onChange=${(e) => onChangeRole(e.target.value)}
        >
          <option value="system">system</option>
          <option value="user">user</option>
          <option value="assistant">assistant</option>
        </select>
        <div class="message-actions">
          ${isArray && html`
            <button class="btn btn-ghost btn-xs" onClick=${handleConvertToPlain} title="Convert to plain text">Plain text</button>
          `}
          <button class="btn btn-ghost btn-xs" onClick=${onMoveUp} disabled=${isFirst} title="Move up">↑</button>
          <button class="btn btn-ghost btn-xs" onClick=${onMoveDown} disabled=${isLast} title="Move down">↓</button>
          <button class="btn btn-ghost btn-xs btn-danger" onClick=${onDelete} title="Delete message">✕</button>
        </div>
      </div>

      <div class="message-body">
        ${isArray
          ? html`
            <div class="content-blocks">
              ${message.content.map((block, i) => {
                if (block.type === 'image_url' || block.type === 'image') {
                  return html`<${ImageBlock}
                    key=${i}
                    block=${block}
                    onChange=${(b) => updateBlock(i, b)}
                    onRemove=${() => removeBlock(i)}
                  />`;
                }
                return html`<${TextBlock}
                  key=${i}
                  block=${block}
                  onChange=${(b) => updateBlock(i, b)}
                  onRemove=${message.content.length > 1 ? () => removeBlock(i) : null}
                />`;
              })}
            </div>
            <div class="block-add-bar">
              <button class="btn btn-ghost btn-xs" onClick=${handleAddTextBlock}>+ Text block</button>
              <input
                ref=${addImageRef}
                type="file"
                accept="image/*"
                class="hidden"
                onChange=${(e) => { handleAddImage(e.target.files?.[0]); e.target.value = ''; }}
              />
              <button class="btn btn-ghost btn-xs" onClick=${() => addImageRef.current?.click()}>+ Image block</button>
            </div>
          `
          : html`
            <textarea
              ref=${textareaRef}
              class="message-textarea"
              value=${message.content}
              placeholder=${`${message.role} message...`}
              spellcheck="false"
              onInput=${(e) => { autoResize(e.target); onChangeContent(e.target.value); }}
            ></textarea>
            <div class="block-add-bar">
              <input
                ref=${addImageRef}
                type="file"
                accept="image/*"
                class="hidden"
                onChange=${(e) => { handleAddImage(e.target.files?.[0]); e.target.value = ''; }}
              />
              <button class="btn btn-ghost btn-xs" onClick=${() => addImageRef.current?.click()}>+ Add image</button>
            </div>
          `
        }
      </div>
    </div>
  `;
}

export function MessageEditor({ messages, onChange }) {
  function updateMessage(idx, updates) {
    onChange(messages.map((m, i) => (i === idx ? { ...m, ...updates } : m)));
  }

  function addMessage(role = 'user') {
    onChange([...messages, { role, content: '' }]);
  }

  function deleteMessage(idx) {
    onChange(messages.filter((_, i) => i !== idx));
  }

  function moveMessage(idx, dir) {
    const next = [...messages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return html`
    <div class="flex-col" style="height:100%;overflow:hidden">
      <div class="messages-area">
        ${messages.length === 0 && html`
          <div style="text-align:center;padding:32px;color:var(--text-3);font-size:12px">
            No messages. Add a message below to get started.
          </div>
        `}
        ${messages.map((msg, i) => html`
          <${MessageItem}
            key=${i}
            message=${msg}
            onChangeContent=${(content) => updateMessage(i, { content })}
            onChangeRole=${(role) => updateMessage(i, { role })}
            onDelete=${() => deleteMessage(i)}
            onMoveUp=${() => moveMessage(i, -1)}
            onMoveDown=${() => moveMessage(i, 1)}
            isFirst=${i === 0}
            isLast=${i === messages.length - 1}
          />
        `)}
      </div>
      <div class="messages-toolbar">
        <button class="btn btn-sm" onClick=${() => addMessage('user')}>+ User</button>
        <button class="btn btn-sm" onClick=${() => addMessage('system')}>+ System</button>
        <button class="btn btn-sm" onClick=${() => addMessage('assistant')}>+ Assistant</button>
      </div>
    </div>
  `;
}

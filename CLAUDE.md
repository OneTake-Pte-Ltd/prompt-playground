# Prompt Playground — Claude Session Context

## What this is
A no-build-step single-page web app for prompt engineering and testing. Built with Preact + HTM served as static files. Open `index.html` directly in a browser or via any static server (`python3 -m http.server`). No npm, no bundler.

## Tech stack
- **Preact 10 + HTM** from `esm.sh` CDN — all imports use tagged-template `html\`...\`` syntax instead of JSX
- **No TypeScript** — plain JS throughout
- **CSS** — single `styles.css`, dark theme, BEM-ish naming, CSS custom properties in `:root`

---

## Architecture

```
app.js                    Root component, all top-level state
lib.js                    Re-exports Preact hooks + HTM from CDN
components/
  ApiKeyModal.js          Settings modal (OpenAI + Anthropic keys)
  DiffViewer.js           Fullscreen diff modal (line/word level)
  FileLoader.js           JSON file drag-drop / upload
  MessageEditor.js        Message list editor with collapse/expand
  ParameterPanel.js       LLM params (provider, model, sliders)
  ResponseDisplay.js      Streaming response with JSON highlighting
  SaveModal.js            Save-as-JSON modal with editable metadata
  VariablePanel.js        Template variable inputs
providers/
  index.js                Provider registry + SSE stream parser
  openai.js               OpenAI chat completions (streaming)
  anthropic.js            Anthropic messages API (streaming)
utils/
  messages.js             OpenAI ↔ Anthropic message format conversion
  storage.js              useLocalStorage hook
  testRunner.js           Assertion evaluation (walkExpected, evalDeterministic, fuzzy judge helpers)
  variables.js            Variable substitution into messages
schemas/
  prompt-template.schema.json  JSON schema for prompt files
```

---

## Key patterns

### HTM syntax
```javascript
// NOT JSX — use html tagged templates
return html`<div class="foo"><${MyComponent} prop=${value} /></div>`;
```

### State for async callbacks
`App` maintains a `stateRef` that is synced every render so async provider callbacks always read current state without stale closures:
```javascript
const stateRef = useRef({});
useEffect(() => { stateRef.current = { sessions, apiKeys, variables, ... }; });
// Inside async: const { sessions: cur } = stateRef.current;
```

### Two sessions always
`sessions[0]` and `sessions[1]` always exist. Single mode shows only session 0. Split/Compare mode shows both side-by-side.

### Provider call interface
```javascript
provider.call({ apiKey, params, messages, responseFormat, onChunk, onDone, onError })
// messages must be in OpenAI format — anthropic.js converts internally
```

### Message format
OpenAI format is canonical internally. Conversion happens in `providers/anthropic.js` at call time. Use `normalizeMessages()` (`utils/messages.js`) when loading files to convert Anthropic-format images to OpenAI format.

### Variable substitution
```javascript
applyVariablesToMessages(messages, variables, delimiters)
// delimiters default: ['<%', '%>']  →  <%VARIABLE_NAME%>
```

### autoResize pattern
Textareas in `MessageEditor` use `useLayoutEffect` (not `useEffect`) to fire synchronously after paint:
```javascript
useLayoutEffect(() => { autoResize(ref.current); }, [content]);
function autoResize(el) { el.style.height = '0'; el.style.height = Math.max(80, el.scrollHeight) + 'px'; }
```

---

## JSON prompt file format

Key sections in `template_info`:
- `id` — kebab-case identifier
- `name` — PascalCase display name
- `description` — what the prompt does
- `input_delimiters` — `['<%', '%>']` by default
- `input_variables[0].keys` — array of `{ name, type }` variable definitions
- `performance_tests` — array of `{ input, expected_output }` test cases
- `engineering_method` — documentation object (`intermediary_steps`, `examples_provided`, `expected_outputs`, `other_comments`)

---

## Performance test assertion system

`expected_output` is a sparse mirror of the response schema. Leaves contain assertion arrays.

### Assertion types
| Type | Fields | Evaluation |
|------|--------|------------|
| `exact` | `value` | `actual === value` |
| `range` | `min?`, `max?` | `min <= actual <= max` |
| `contains_any` | `values[]` | case-insensitive substring match, any |
| `fuzzy` | `criterion` | LLM judge (OpenAI `gpt-5.4`, temp 0) |

### `_raw` key
For `response_format.type = "text"`, `expected_output._raw` holds assertions on the full response string. The test runner wraps the raw response as `{ _raw: responseText }` before calling `walkExpected`.

### Utilities in `utils/testRunner.js`
- `isAssertionArray(value)` — detects assertion arrays vs nested data
- `walkExpected(expected, actual, path)` → flat array of `AssertionResult`
- `evalDeterministic(result)` → evaluates exact/range/contains_any in-place
- `buildJudgeMessages(actual, criterion)` → messages array for judge call
- `parseJudgeResponse(raw)` → strips ```json fences, parses JSON

---

## Inline assertion evaluation
After each LLM response completes, `app.js` automatically calls `runAssertions(idx, fullResponse)`. This walks `performance_tests[0].expected_output` against the response and evaluates assertions. Results are stored in `session.assertions` and displayed inline in `ResponseDisplay` via the `AssertionPanel` sub-component.

- `session.assertions === null` → no tests defined (panel hidden)
- `session.assertions === []` → smoke test (empty `expected_output`), shown as "Smoke PASS"
- `session.assertions = [...]` → results array, shown as a compact row-per-assertion list

Fuzzy assertions call OpenAI `gpt-5.4` as a judge and resolve asynchronously, each row updating individually as results arrive.

Both panes in Compare mode get their own assertions evaluated independently after their respective responses complete, so you can see side-by-side which variant passes.

---

## Save modal
`SaveModal` has two sections:
1. Simple fields: `name`, `id`, `description`, `playground_prompt_id`
2. Advanced: full `template_info` (minus above 4 fields) as editable JSON textarea

`buildJsonOutput()` (exported from `SaveModal.js`) builds the final JSON structure.

---

## Gotchas
- Anthropic doesn't support `json_object` response format — the warning banner in `ResponseDisplay` covers this
- `useLayoutEffect` is needed for textarea auto-resize; `useEffect` fires too late and causes a flash
- The `stateRef` pattern is essential for `runSession` — without it, `onChunk` callbacks capture stale session state; `rawFileData` is included in stateRef so `runAssertions` can read it
- Strip `\`\`\`json` fences from any LLM response you expect to parse as JSON (fuzzy judge, etc.)
- `gpt-5.4` is the hardcoded judge model for fuzzy assertions

# Prompt Playground

A browser-based tool for writing, testing, and iterating on LLM prompts — with no installation required.

## Features

- **Single and Compare modes** — edit and run prompts side-by-side to compare variants (Variant A vs Variant B)
- **Multi-provider support** — OpenAI and Anthropic, switchable per variant
- **Template variables** — define placeholders (`<%VARIABLE_NAME%>`) and fill them in without editing the prompt
- **Structured output** — supports `json_schema` and `json_object` response formats with syntax highlighting
- **Test runner** — run assertions against LLM output: exact matches, numeric ranges, keyword checks, and AI-evaluated fuzzy checks
- **Save as JSON** — export any variant with editable metadata (name, ID, description, engineering notes)
- **Diff viewer** — compare two responses word-by-word or line-by-line
- **Streaming** — responses stream in real time

## Getting started

No installation needed. Open `index.html` in your browser:

```bash
# Option 1: open directly (works in most browsers)
open index.html

# Option 2: serve locally (avoids any file:// restrictions)
python3 -m http.server 8080
# then open http://localhost:8080
```

## API keys

Click **⚙ Settings** in the top-right corner to add your OpenAI and/or Anthropic API keys. Keys are stored only in your browser's `localStorage` and never sent anywhere except the respective provider's API.

## Prompt files

Prompts are saved as JSON files that follow the schema in `schemas/prompt-template.schema.json`. Load an existing file with the **Open** button (or drag and drop), edit in the UI, then **↓ Save** to download the updated file.

The JSON format supports:
- Full message history (system, user, assistant turns)
- Template variable definitions
- LLM parameters (model, temperature, max tokens, etc.)
- Response format constraints
- Performance test cases with typed assertions

## Test runner

If a loaded prompt file includes `performance_tests`, the **⚑ Tests** button appears in the header. Each test case specifies input variables and an `expected_output` assertion tree. Supported assertion types:

| Type | Description |
|------|-------------|
| `exact` | Strict equality check |
| `range` | Numeric bounds (`min`, `max`, or both) |
| `contains_any` | Case-insensitive substring match |
| `fuzzy` | AI-evaluated semantic check (uses OpenAI `gpt-5.4` as judge) |

See `CLAUDE.md` for developer documentation.

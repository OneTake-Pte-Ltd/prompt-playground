const KNOWN_TYPES = new Set(['exact', 'range', 'contains_any', 'fuzzy']);

// Returns true when value is an array of assertion objects (all elements have a known .type)
export function isAssertionArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === 'object' && KNOWN_TYPES.has(item.type))
  );
}

// Walk the expected_output tree and return flat list of AssertionResult objects:
// { path, assertion, actual, pass, details, pending }
// pending=true means fuzzy — needs async judge evaluation.
export function walkExpected(expected, actual, path = '') {
  const results = [];

  if (isAssertionArray(expected)) {
    for (const assertion of expected) {
      results.push({
        path: path || '(root)',
        assertion,
        actual,
        pass: null,
        details: null,
        pending: assertion.type === 'fuzzy',
      });
    }
    return results;
  }

  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    for (const [key, value] of Object.entries(expected)) {
      const childPath = path ? `${path}.${key}` : key;
      const actualChild =
        actual != null && typeof actual === 'object' && !Array.isArray(actual)
          ? actual[key]
          : undefined;

      if (actualChild === undefined) {
        results.push({
          path: childPath,
          assertion: { type: 'missing' },
          actual: undefined,
          pass: false,
          details: 'Field not found in response',
          pending: false,
        });
      } else {
        results.push(...walkExpected(value, actualChild, childPath));
      }
    }
  }

  return results;
}

// Evaluate deterministic assertions (exact, range, contains_any) in-place.
// Fuzzy and missing results are passed through unchanged.
export function evalDeterministic(result) {
  if (result.pending || result.pass !== null) return result;

  const { assertion, actual } = result;

  switch (assertion.type) {
    case 'exact': {
      // Coerce to same type for comparison (handles number-as-string edge cases)
      const pass = actual === assertion.value;
      return {
        ...result,
        pass,
        details: pass ? null : `Expected ${JSON.stringify(assertion.value)}, got ${JSON.stringify(actual)}`,
      };
    }
    case 'range': {
      const num = Number(actual);
      if (isNaN(num)) {
        return { ...result, pass: false, details: `"${actual}" is not a number` };
      }
      const okMin = assertion.min == null || num >= assertion.min;
      const okMax = assertion.max == null || num <= assertion.max;
      const pass = okMin && okMax;
      const range = formatRange(assertion);
      return {
        ...result,
        pass,
        details: pass ? null : `Expected ${range}, got ${num}`,
      };
    }
    case 'contains_any': {
      const str = String(actual).toLowerCase();
      const pass = assertion.values.some((v) => str.includes(v.toLowerCase()));
      return {
        ...result,
        pass,
        details: pass ? null : `None of [${assertion.values.map((v) => `"${v}"`).join(', ')}] found`,
      };
    }
    default:
      return result;
  }
}

function formatRange(assertion) {
  if (assertion.min != null && assertion.max != null) return `${assertion.min}–${assertion.max}`;
  if (assertion.min != null) return `≥${assertion.min}`;
  return `≤${assertion.max}`;
}

// Human-readable "expected" string for the results table
export function formatExpected(assertion) {
  switch (assertion.type) {
    case 'exact': return String(assertion.value);
    case 'range': return formatRange(assertion);
    case 'contains_any': return assertion.values.join(' or ');
    case 'fuzzy': {
      const c = assertion.criterion;
      return c.length > 80 ? c.slice(0, 77) + '…' : c;
    }
    case 'missing': return '(field must exist)';
    default: return '';
  }
}

// Truncate an actual value for display in the table
export function formatActual(actual) {
  if (actual === undefined) return '(missing)';
  if (actual === null) return 'null';
  const s = typeof actual === 'string' ? actual : JSON.stringify(actual);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}

// Build judge messages for a fuzzy assertion
export function buildJudgeMessages(actualValue, criterion) {
  const actualStr =
    typeof actualValue === 'string' ? actualValue : JSON.stringify(actualValue, null, 2);
  return [
    {
      role: 'system',
      content:
        'You are a test evaluator. Determine whether the actual output satisfies the criterion.',
    },
    {
      role: 'user',
      content:
        `ACTUAL OUTPUT:\n${actualStr}\n\nCRITERION:\n${criterion}\n\n` +
        'Respond with ONLY valid JSON: {"pass": true} or {"pass": false, "reason": "..."}',
    },
  ];
}

// Parse judge JSON response, stripping ```json ... ``` fences if present
export function parseJudgeResponse(raw) {
  const stripped = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(stripped);
}

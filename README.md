# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Math engine (Phase 2)

`src/math/` is a deterministic arithmetic engine written from scratch. It does not use `eval()`, `Function()` or any math library, and it has no runtime dependencies.

```ts
import { evaluateString } from './src/math';

evaluateString('18+4×3=');  // { kind: 'ok', display: '30', ... }
evaluateString('5÷0=');     // { kind: 'undefined', display: 'Undefined', ... }
evaluateString('3+×4=');    // { kind: 'error', code: 'UNEXPECTED_OPERATOR', ... }
evaluateString('3+');       // { kind: 'pending', ... }  (no "=" yet, so errors stay hidden)
```

Pipeline: `tokenize` → `toRPN` (Dijkstra's shunting-yard) → `evaluateRPN` (stack machine) → `formatNumber` (12 significant digits, so `0.1+0.2` shows `0.3`).

| File | Role |
| --- | --- |
| `src/math/symbols.ts` | The 18 canonical symbols and `RecognizedExpression` |
| `src/math/tokenizer.ts` | Merges digits into numbers, handles unary minus and implicit `2(3)` |
| `src/math/parser.ts` | Shunting-yard to RPN, plus syntax validation |
| `src/math/evaluator.ts` | RPN evaluation; `÷0` gives `Undefined`, overflow is detected |
| `src/math/format.ts` | Display formatting |
| `src/math/index.ts` | `evaluate()` / `evaluateString()`; never throws |
| `src/recognition/inkOnAdapter.ts` | Maps [ink-on](https://github.com/kimseungdae/ink-on) LaTeX tokens (`\times`, `\div`, …) to canonical symbols |

Every stage returns a typed `Result` instead of throwing. Before `=` is written, a valid expression returns a provisional value (`pending: true`) and an invalid one returns `{ kind: 'pending' }`, so half-written equations never show errors.

### Tests

```bash
npm test               # all suites
npm run test:coverage  # coverage report; first run: npm i -D @vitest/coverage-v8@^5
```

`tests/math/` covers the tokenizer, parser, evaluator, formatter and adapter. It also includes a 50-row golden table, seeded property tests (2,000 random expressions checked against a separate reference evaluator, and 2,000 random symbol sequences that must never throw), and a safety test that scans `src/` for `eval`/`Function`.

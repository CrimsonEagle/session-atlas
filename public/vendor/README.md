# PixiJS 8.21.0

Vendored for offline use, licensed under MIT (see PIXI-LICENSE.txt).

- `pixi-8.21.0.mjs`: https://cdn.jsdelivr.net/npm/pixi.js@8.21.0/dist/pixi.min.mjs (unmodified).
- `pixi-csp-8.21.0.mjs`: https://cdn.jsdelivr.net/npm/pixi.js@8.21.0/dist/packages/unsafe-eval.js
  with only its global wrapper adapted to ESM: `this.PIXI` becomes a namespace
  import from the local module, the final global export assignment is omitted,
  and the source map comment is removed. The official polyfills replace dynamic
  code generation; the app retains `script-src 'self'` without `unsafe-eval`.

The background is the only PixiJS consumer and disables both built-in tickers.
Its own visibility-aware, capped render loop handles scheduling and cleanup.

# CommonJS `require()` Path Rewriting

> [!WARNING]
> **Status: Considered but rejected**
>
> This feature was explored but will not be implemented. See [Conclusion](#conclusion) for rationale.

## Summary

This document explores approaches for extending monodrop to support CommonJS modules. After analysis, we concluded that no approach provides acceptable trade-offs, and monodrop will remain ESM-only.

## Current Behavior

Monodrop rejects CommonJS files with an error:

- `.cjs` files → Error: "Cannot process a .cjs file"
- `.js` files without `"type": "module"` → Error: "Cannot process a .js file in a CommonJS package"

This behavior will remain unchanged.

## Approaches Considered

### 1. Static AST Rewriting

Rewrite `require()` calls statically using ts-morph, similar to how ESM imports are handled.

**Why rejected:** `require` is a function, not a keyword, so it can be aliased:

```javascript
const r = require;
r('./foo');  // Not detected by static analysis

const loaders = { r: require };
loaders.r('./baz');  // Impossible to analyze without data-flow analysis
```

Static analysis covers ~95% of cases but isn't airtight. Unlike ESM where `import` is a keyword that cannot be aliased, CJS aliasing is valid JavaScript that we cannot reliably detect.

### 2. Runtime Module Resolution Hook

Intercept `require()` at runtime using `Module._resolveFilename`:

```javascript
const Module = require('module');
const original = Module._resolveFilename;

Module._resolveFilename = function(request, parent, isMain, options) {
  // Rewrite in-repo package paths
  return original.call(this, rewrittenRequest, parent, isMain, options);
};
```

This catches 100% of `require()` calls regardless of aliasing.

**Why rejected:** Bundlers (webpack, esbuild, rollup) resolve `require()` at **build time**, not runtime. When a consumer bundles code that uses a monodrop-packaged CJS package:

1. Bundler sees `require('@myorg/utils')` in the source
2. Bundler tries to resolve `@myorg/utils` at build time
3. `@myorg/utils` doesn't exist as a real package—it's embedded in `./deps/`
4. Bundler fails to resolve

The runtime hook never gets a chance to intervene because the bundler transforms/resolves requires before the code runs. This is a fundamental incompatibility.

#### Performance Considerations (for reference)

We also investigated the performance impact of runtime hooks. Since `Module` is a process-wide singleton, multiple monodrop-packaged packages would compound hooks. We designed a solution using a single shared hook with O(1) lookup by package name:

- Registry keyed by package name (extracted from request)
- Non-monodrop requires: O(1) overhead (negligible)
- Monodrop requires: O(K) where K = packages depending on that in-repo package (typically 1-3)

This solved the performance concern, but doesn't address the bundler incompatibility.

### 3. Hybrid Approach

Combine static rewriting for direct `require()` calls with runtime hooks for aliased/computed patterns.

**Why rejected:** Adds significant complexity for marginal benefit. The bundler incompatibility still applies to the runtime hook portion, creating inconsistent behavior depending on how consumers use the package.

## Conclusion

No approach provides acceptable trade-offs:

| Approach | Coverage | Bundler Compatible | Complexity |
|----------|----------|-------------------|------------|
| Static rewriting | ~95% | Yes | Low |
| Runtime hooks | 100% | No | Medium |
| Hybrid | ~95% static, 100% runtime | Partial | High |

Given that:
- CJS is legacy; ESM is the ecosystem direction
- Monodrop's value proposition is already strong for ESM
- Half-working CJS support with caveats would cause more confusion than value

We decided to keep monodrop focused on ESM, where it can provide reliable, complete support.

## Recommendation for CJS Users

If you have a monorepo with CommonJS packages, consider:

1. **Migrate to ESM** - Add `"type": "module"` to package.json and update imports
2. **Use `.mjs` extension** - For gradual migration, rename files to `.mjs`
3. **Dual publishing** - Build both CJS and ESM outputs, use monodrop for the ESM version

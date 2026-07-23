# File Format Support for .mjs in Monodrop

## Status: Implemented

Support for ES module file formats (`.mjs`) and their TypeScript declaration equivalents (`.d.mts`) has been implemented. **CommonJS files are explicitly rejected** to ensure reliable import rewriting.

---

## ES Modules Only

Monodrop only supports ES modules. All packages must have `"type": "module"` in their package.json, or use `.mjs` file extensions.

### Why ES Modules Only?

Monodrop rewrites imports from in-repo packages to relative paths. This rewriting relies on parsing ES module syntax (`import`/`export` declarations and dynamic `import()` calls).

CommonJS `require()` calls cannot be reliably rewritten because:
- `require()` is a regular function call, not special syntax
- It can be aliased, dynamically constructed, or wrapped
- Detecting all `require()` usages would require complex static analysis with edge cases

Rather than silently produce broken output, monodrop rejects CommonJS files upfront with a clear error message.

---

## Supported File Formats

| Extension | Status | Notes |
|-----------|--------|-------|
| `.js` with `"type": "module"` | Supported | Imports are rewritten |
| `.mjs` | Supported | Always ESM, imports are rewritten |
| `.d.ts` | Supported | Type declarations are rewritten |
| `.d.mts` | Supported | Type declarations are rewritten |
| `.js` without `"type": "module"` | **Rejected** | Treated as CommonJS |
| `.cjs` | **Rejected** | Always CommonJS |
| `.d.cts` | **Rejected** | Associated with CommonJS |

---

## Error Messages

### For `.cjs` files:
```
Cannot process CommonJS file: packages/lib/dist/index.cjs
Monodrop only supports ES modules. Use .mjs extension or set "type": "module" in package.json.
```

### For `.js` files without `type: "module"`:
```
Cannot process CommonJS file: packages/lib/dist/index.js
Package "@myorg/lib" does not have "type": "module" in package.json.
Monodrop only supports ES modules. Set "type": "module" in package.json or use .mjs extension.
```

---

## Migration Guide

To use monodrop with your monorepo:

1. **Add `"type": "module"` to all package.json files** that contain JavaScript code
2. **Use ES module syntax** (`import`/`export`) instead of CommonJS (`require`/`module.exports`)
3. **Rename `.cjs` files to `.mjs`** and update to ES module syntax
4. **Update TypeScript config** if needed:
   ```json
   {
     "compilerOptions": {
       "module": "ESNext",
       "moduleResolution": "bundler"
     }
   }
   ```

---

## Technical Implementation

The CommonJS detection happens early in `src/validate-esm.ts`, called from `src/package-assembler.ts`:

1. After collecting package locations (determining which files will be copied)
2. Before any file I/O (directory creation, file copying)
3. Files ending with `.cjs` or `.d.cts` are rejected
4. Files ending with `.js` are checked against their package's `type` field
5. If `type` is not `"module"`, the file is rejected

This "fail early" approach ensures no work is done before validation fails.

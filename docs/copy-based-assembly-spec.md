# Monopush: Copy-Based Assembly

## Problem Statement

An earlier version of Monopush used esbuild to bundle a package and its in-repo dependencies into a single `index.js` file. This worked for JavaScript but **produced no type declarations**. The published package had no `.d.ts` files, making it unusable for TypeScript consumers.

Bundling `.d.ts` files is possible (via `dts-bundle-generator`, `rollup-plugin-dts`, or `api-extractor`) but adds complexity and another tool to maintain.

### Current Approach

Instead of bundling, **copy the compiled `dist/` directories** from the subject package and all its in-repo dependencies. Rewrite import specifiers from package names (`@myorg/b`) to relative paths (`../deps/packages/b/dist/index.js`).

Benefits:
- Unified handling for `.js` and `.d.ts` files
- Preserves module boundaries (better tree-shaking for consumers)
- No bundler—conceptually simpler
- Source maps work without remapping

---

## Output Directory Structure

Given a monorepo:
```
monorepo/
  packages/
    a/                    ← source package
      dist/
        index.js
        index.d.ts
        utils/
          helper.js
          helper.d.ts
      package.json        ← has main: "dist/index.js", types: "dist/index.d.ts"
    b/                    ← in-repo dep of a
      dist/
        index.js
        index.d.ts
      package.json
  libs/
    utils/                ← another in-repo dep
      dist/
        index.js
        index.d.ts
      package.json
```

Monopush produces:
```
output/
  package.json            ← transformed from source package
  dist/                   ← copy of packages/a/dist/ (imports rewritten)
    index.js
    index.d.ts
    utils/
      helper.js
      helper.d.ts
  deps/                   ← in-repo dependencies, mirroring monorepo structure
    packages/
      b/
        dist/
          index.js
          index.d.ts
    libs/
      utils/
        dist/
          index.js
          index.d.ts
```

### Key Points

1. **`dist/`** at output root is a copy of the source package's `dist/`
2. **`deps/`** mirrors the monorepo-relative paths of in-repo dependencies
3. **Only `dist/` directories** are copied—no `src/`, `node_modules/`, etc.
4. **`package.json`** entry points (`main`, `types`, `exports`) work unchanged because `dist/` is in the same relative position

---

## Import Rewriting with ts-morph

### Overview

Use [ts-morph](https://ts-morph.com/) to parse and transform `.js` and `.d.ts` files. For each import/export specifier that references an in-repo package, rewrite it to a relative path.

### Data Structures

```typescript
interface PackageLocation {
  name: string                   // e.g., "@myorg/b"
  monorepoRelativePath: string   // e.g., "packages/b" (path from monorepo root)
  entryPoint: string             // e.g., "dist/index.js" (from package.json main)
}

// Build a map for all in-repo packages (including the source package)
type PackageMap = Map<string, PackageLocation>
```

### Algorithm

1. **Build package map**: For each package in the dependency graph, record its name, monorepo-relative path, and entry point (from `package.json` `main` field, defaulting to `dist/index.js`)

2. **Copy files**: Copy `dist/` directories to their output locations:
   - Source package: `output/dist/`
   - Dependencies: `output/deps/{monorepoRelativePath}/dist/`

3. **Transform files**: For each `.js` and `.d.ts` file in the output:
   ```typescript
   const project = new Project()
   const sourceFile = project.addSourceFileAtPath(filePath)

   // Process imports
   for (const decl of sourceFile.getImportDeclarations()) {
     const specifier = decl.getModuleSpecifierValue()
     if (packageMap.has(specifier)) {
       const target = packageMap.get(specifier)
       const relativePath = computeRelativePath(filePath, target)
       decl.setModuleSpecifier(relativePath)
     }
   }

   // Process export declarations (export { x } from '...')
   for (const decl of sourceFile.getExportDeclarations()) {
     const specifier = decl.getModuleSpecifierValue()
     if (specifier && packageMap.has(specifier)) {
       const target = packageMap.get(specifier)
       const relativePath = computeRelativePath(filePath, target)
       decl.setModuleSpecifier(relativePath)
     }
   }

   // Handle dynamic imports if needed (import('...'))
   // These appear as CallExpression nodes

   sourceFile.saveSync()
   ```

4. **Relative path computation**:
   ```typescript
   function computeRelativePath(fromFile: string, target: PackageLocation): string {
     // fromFile: absolute path to the file being transformed
     // target: the in-repo package being imported

     const targetPath = target.isSourcePackage
       ? path.join(outputDir, target.entryPoint)
       : path.join(outputDir, 'deps', target.monorepoRelativePath, target.entryPoint)

     let relative = path.relative(path.dirname(fromFile), targetPath)
     if (!relative.startsWith('.')) {
       relative = './' + relative
     }
     return relative
   }
   ```

### Edge Cases

- **Subpath imports**: `import { x } from '@myorg/b/submodule'`—these need the subpath preserved after the package prefix is rewritten
- **Dynamic imports**: `const m = await import('@myorg/b')`—find via AST traversal of `CallExpression` nodes where the expression is `import`
- **Barrel re-exports**: `export * from '@myorg/b'`—handled by `getExportDeclarations()`

---

## package.json Transformations

Start with the source package's `package.json`. Apply these transformations:

### Keep As-Is
- `name`, `version`, `description`, `keywords`, `author`, `license`
- `repository`, `homepage`, `bugs`
- `main`, `types`, `exports`, `type` ← entry points still valid
- `engines`, `bin`

### Transform
- **`dependencies`**:
  1. Remove all in-repo packages
  2. Merge in third-party dependencies from all in-repo deps (already implemented in `transformPackageJson`)

### Remove
- `devDependencies`
- `scripts`
- `workspaces`
- `private`

---

## Testing Guidelines

### Unit Tests

1. **Import rewriting**:
   - Test that `import { x } from '@myorg/b'` becomes `import { x } from '../deps/packages/b/dist/index.js'` (path depends on file location)
   - Test files at different depths (`dist/index.js` vs `dist/utils/helper.js`)
   - Test `export { x } from '...'` syntax
   - Test `import type` and `export type`
   - Test that third-party imports are unchanged

2. **Path computation**:
   - Source package files → deps
   - Dep files → other deps
   - Nested files within dist

3. **package.json transformation**:
   - In-repo deps removed from dependencies
   - Third-party deps merged from all packages
   - Entry points preserved

### Integration Tests

Use `folderify` to create realistic monorepo structures:

```typescript
const recipe = {
  'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
  packages: {
    a: {
      'package.json': JSON.stringify({
        name: '@myorg/a',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        dependencies: { '@myorg/b': '*', 'lodash': '^4.0.0' }
      }),
      dist: {
        'index.js': `import { foo } from '@myorg/b';\nexport const bar = foo;`,
        'index.d.ts': `import { foo } from '@myorg/b';\nexport declare const bar: typeof foo;`
      }
    },
    b: {
      'package.json': JSON.stringify({
        name: '@myorg/b',
        main: 'dist/index.js',
        dependencies: { 'lodash': '^4.0.0' }
      }),
      dist: {
        'index.js': `export const foo = 'foo';`,
        'index.d.ts': `export declare const foo: string;`
      }
    }
  }
}
```

Verify:
1. Output structure matches expected layout
2. Imports in output files are valid relative paths
3. TypeScript can resolve types (run `tsc --noEmit` on a consumer file that imports from output)

### Type Resolution Test

Create a consumer `tsconfig.json` pointing at the output, verify that:
```typescript
import { bar } from './output'
const x: string = bar  // Should typecheck
```

---

## Migration Path

This was a breaking change to monopush's output format. The output changed from:
```
output/
  index.js          ← single bundled file (old approach)
  package.json
```

To:
```
output/
  dist/             ← module structure preserved (current approach)
  deps/
  package.json
```

Consumers of monopush needed to update any assumptions about output structure.

---

## Out of Scope

- Handling `require()` calls (assume ESM only)
- Sourcemap rewriting (they should work as-is since file structure is preserved)
- Non-`dist/` output directories (could be added later by reading `outDir` from tsconfig)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript (tsc)
npm test               # Run tests once (vitest run)
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
npm run lint           # Run ESLint on src/
npm run lint:fix       # Auto-fix lint issues
npm run typecheck      # Type-check without emitting (tsc --noEmit)
```

Run a single test file:
```bash
npx vitest run src/monocrate.test.ts
```

Run tests matching a pattern:
```bash
npx vitest run -t "pattern"
```

## What Monocrate Does

Publishing a package from a monorepo to npm is painful when your package depends on other internal packages (like `@myorg/utils`). npm doesn't understand workspace dependencies, forcing you to either publish every internal dependency separately, manually assemble and merge dependencies, or use complex build pipelines that lose module structure.

Monocrate solves this by assembling a package and all its in-repo dependencies into a single publishable unit. In-repo dependencies get copied and their imports rewritten; third-party dependencies are collected from all packages and merged into a single output package.json.

Only `dependencies` are traversed and included—`devDependencies` are ignored entirely. This is because devDependencies are only needed during development (build tools, test frameworks, linters); consumers of the published package don't need them at runtime.

## Architecture

### Main Responsibilities

- `main.ts` - CLI entry point (shebang)
- `monocrate-cli.ts` - CLI argument parsing (uses yargs)
- `index.ts` - Library exports (public API re-exports)

### Core Flow

The `monocrate()` function orchestrates: discover monorepo root → build dependency graph → assemble (copy dist directories and rewrite imports) → transform package.json → write output.

### Testing

Tests use helper utilities:
- `folderify(recipe)`: Creates temp directory structure from object DSL
- `unfolderify(dir)`: Reads directory back to recipe for assertions

Coverage thresholds: 90% lines/functions/statements, 85% branches.

## TypeScript Configuration

Strict mode with additional checks: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`.

## Coding Patterns

**Compiler-verified type safety**: Prefer designs where the compiler can verify correctness. If you find yourself needing to "tell" TypeScript something is safe, redesign so it can prove it instead.

**No unchecked type casting**: Never use `!` (non-null assertion) or `as` (type assertion). If TypeScript can't verify the type, restructure the code or add a runtime check.

**Minimal entry points**: `main.ts` contains only shebang + import + function call. All logic lives elsewhere.

**Use derived types from Zod schemas**: Introduce and use a derived type. Do not duplicate the shape manually.

**Use same name for a Zod schema and its derived type**: `const Foo = z.object({...}); type Foo = z.infer<typeof Foo>`

**safeParse over parse**: Use `safeParse()` to get structured errors with context, not generic "validation failed" exceptions.

**Fail early and loud**: Always prefer to detect errors as soon as possible and to throw (to abort the execution) instead of trying to cope/recover. You can catch an error locally if you need to translate the caught error into a more meaningful message.

**Handle errors at the top**: let the entry point file catch/report/exit.

**Resolve paths immediately**: Call `path.resolve()` on all path arguments as early as possible. Prevents subtle bugs from mixing relative/absolute paths.

**flatMap for conditional mapping**: `.flatMap(x => x ? [x] : [])` filters falsy values while preserving type narrowing (unlike `.filter(Boolean)`).

**Prefer undefined over null**: Always use `undefined` to represent absence of a value. Only use `null` when required by an external library or API.

**Naming conventions**: Function and method names should be verbs (e.g., `buildGraph`, `resolvePackage`). Class, type, and interface names should be nouns (e.g., `DependencyGraph`, `PackageInfo`).

**Partial Record over Record**: Use `Partial<Record<string, T>>` instead of `Record<string, T>` for dictionary-like objects. This mekes it explicit that properties may be undefined, preventing bugs from assuming all keys exist.

**Early exits over nesting**: Prefer early returns to avoid extra nesting levels. Check for error conditions or edge cases as early as possible and return/throw immediately, keeping the main logic at the lowest indentation level.

**Side-effecting functions throw on failure**: A side-effecting function should fail by throwing, not by returning an error value (e.g., `{success: false, error: ...}`). Callers of side-effecting functions typically just want the side effect and won't inspect the return value.

**Always specify expected error messages in toThrow()**: Never use bare `toThrow()` without an argument. Always pass an expected error message (e.g., `toThrow("dependency not found")`). This verifies the test actually triggered the intended error path, not some unrelated failure. A partial string is acceptable as long as it's specific enough to confirm the correct sad-path was executed.

**Prioritize intent clarity in tests**: Decide deliberately how each test communicates its intent. In simple cases, inlining values often expresses intent more directly than introducing temporary variables. Use variables when they actively improve readability—by naming intent, representing domain concepts, or avoiding repetition. Prefer the style that best explains why the test exists, not just how it's written.```




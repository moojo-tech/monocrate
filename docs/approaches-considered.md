# Approaches for Embedding In-Repo Dependencies

Monocrate needs to embed in-repo (workspace) dependencies into the published tarball so consumers can install the package without those internal packages existing on npm. Three approaches were tried; each failed for different reasons rooted in how package managers and Node.js resolve modules.

## Approach 1: Rewrite Import Paths at Pack Time

Copy in-repo dependency files into the output and rewrite all import specifiers from package names (`@myorg/utils`) to relative paths (`./deps/@myorg/utils/dist/index.js`).

**Result: works for ESM, fails for CJS.**

ESM `import` declarations are static: the specifier must be a string literal, it must appear at the top level, and it is parsed before execution ([Node.js ESM docs](https://nodejs.org/api/esm.html), [MDN import reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import)). This makes them straightforward to find and rewrite with an AST tool.

CJS `require()` is a regular function call resolved at runtime ([Node.js CJS docs](https://nodejs.org/api/modules.html)). It can accept variables, computed expressions, and can be aliased to another name:

```javascript
const r = require
r('./foo')

const loaders = { load: require }
loaders.load('./bar')
```

No static analysis can reliably catch all of these patterns. See also [docs/features/2026-02-03-commonjs-rewriting.REJECTED.md](features/2026-02-03-commonjs-rewriting.REJECTED.md) for a deeper analysis.

## Approach 2: `bundledDependencies`

Place in-repo dependencies under `node_modules/` in the output and use the `bundledDependencies` field so `npm pack` includes them in the tarball.

**Result: works with npm + pnpm, fails with yarn (v1 and berry) and bun.**

Two constraints interact to make this unworkable:

### Constraint 1: `bundledDependencies` requires listing in `dependencies` too

The npm docs state that `bundledDependencies` package names "do not include any versions, as that information is specified in `dependencies`" ([npm package.json docs](https://docs.npmjs.com/cli/v7/configuring-npm/package-json/)). In other words, bundled packages must also appear in the `dependencies` field. If they don't, `npm install` has no version to resolve, and no `node_modules/` entry is created for the consumer, so Node's module resolution fails at runtime ([npm/npm#6435](https://github.com/npm/npm/issues/6435)).

### Constraint 2: listing in `dependencies` breaks non-npm package managers

Once an in-repo package is listed under `dependencies`, each package manager tries to resolve it:

- **Yarn v1** ignores the bundled copy and tries to fetch the package from the npm registry. Since the in-repo package was never published there, installation fails. This is a known, long-standing bug ([yarnpkg/yarn#5998](https://github.com/yarnpkg/yarn/issues/5998), [yarnpkg/yarn#8436](https://github.com/yarnpkg/yarn/issues/8436)).

- **Yarn Berry** describes `bundledDependencies` as "an artifact of the past" in its [migration guide](https://yarnpkg.com/migration/guide). The feature is incompatible with Plug'n'Play (which has no `node_modules/`) and is absent from the [manifest configuration reference](https://yarnpkg.com/configuration/manifest). Yarn Berry recommends alternatives like `file:` or self-bundling with esbuild/webpack.

- **Bun** did not support `bundledDependencies` at all in `bun install` until late December 2024 ([oven-sh/bun#8780](https://github.com/oven-sh/bun/issues/8780), fixed in PR #16055). Any work predating that fix would hit this gap.

- **pnpm** handled the basic case correctly in our tests, though it has its own known issues with bundled subdependencies due to its symlink-based linking strategy ([pnpm/pnpm#844](https://github.com/pnpm/pnpm/issues/844), [pnpm/pnpm#8024](https://github.com/pnpm/pnpm/issues/8024)).

The net effect: supporting all major package managers with `bundledDependencies` is not feasible.

## Approach 3: `file:` Protocol with a `deps-<uuid>/` Directory

Place in-repo dependencies under a `deps-<uuid>/` directory in the output and reference them using `file:` paths in `dependencies` (e.g., `"@myorg/utils": "file:./deps-abc123/@myorg/utils"`).

**Result: works with npm, fails with yarn (v1 and berry) and bun.**

The `file:` protocol resolves relative paths differently across package managers. Npm resolves `file:` paths relative to the package that declares them ([yarnpkg/yarn#973](https://github.com/yarnpkg/yarn/issues/973) documents this discrepancy). Yarn v1 historically resolved them relative to the consumer's project root instead; a fix was merged ([yarnpkg/yarn#1498](https://github.com/yarnpkg/yarn/pull/1498)) but the behavior for paths inside *installed* (published) packages remains inconsistent. Yarn Berry [copies the target folder](https://yarnpkg.com/protocol/file) rather than symlinking, but doesn't clearly specify resolution semantics for `file:` paths embedded in installed packages. Bun has its own `file:` resolution issues in nested dependency scenarios ([oven-sh/bun#25752](https://github.com/oven-sh/bun/issues/25752)).

In practice, after publishing, yarn v1, yarn berry, and bun look for the `deps-<uuid>/` directory relative to the consumer's project root (where it doesn't exist) rather than relative to the installed package directory.

## Summary

| Approach | npm | pnpm | Yarn v1 | Yarn Berry | Bun |
|---|---|---|---|---|---|
| Import rewriting | ESM only | ESM only | ESM only | ESM only | ESM only |
| `bundledDependencies` | Works | Works | Fails | Fails | Fails* |
| `file:` protocol | Works | Untested | Fails | Fails | Fails |

*Bun added `bundledDependencies` support in Dec 2024; earlier versions fail.

The common thread: every approach relies on either a runtime mechanism (Node module resolution, `file:` path resolution) or a packaging mechanism (`bundledDependencies`) that at least some package managers handle differently or don't support. Monocrate's current approach (copy files into `node_modules/` + `bundledDependencies` + list in `dependencies`) works for npm and pnpm but not for yarn or bun.

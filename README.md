# monocrate

[![npm version](https://img.shields.io/npm/v/monocrate.svg)](https://www.npmjs.com/package/monocrate)
[![CI](https://github.com/imaman/monocrate/actions/workflows/ci.yml/badge.svg)](https://github.com/imaman/monocrate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*Monorepos? Great. Publishing from a monorepo? Comically hard.*

## The Problem

Consider `@acme/my-awesome-package`, which imports `@acme/internal-utils`, a workspace dependency. The naive 
approach - running `npm publish` - produces an uninstallable package because `@acme/internal-utils` was never published
to npm.

The standard solution is the "publish everything" approach. Tools like [Lerna](https://lerna.js.org/) will publish every
internal dependency as its own public package. Installation now works, but `@acme/internal-utils` just became a 
permanently published API you're committed to maintaining. _Your internal refactoring freedom is gone._

You can throw a bundler at the problem: tools like [esbuild](https://esbuild.github.io/) or 
[Rollup](https://rollupjs.org/) produce a self-contained file from a given entrypoint. But type declarations and 
sourcemaps often break, and consumers can't tree-shake a pre-bundled blob.

## The Solution

[monocrate](https://www.npmjs.com/package/monocrate) is a publishing CLI that gets this right. It produces a single 
publishable directory containing everything needed from your package and its in-repo dependencies. Essentially, it 
produces a standard npm package that looks like you hand-crafted it for publication.

- 📦 Consumers get one package with exactly the code they need
- 🔒 Internal packages remain unpublished
- ✅ Tree-shaking, sourcemaps, and types all work

> [!NOTE]
> **ESM only** — monocrate supports ES modules exclusively. CommonJS packages (`.cjs` files or `.js` without `"type": "module"`) are not supported. If your monorepo uses CommonJS, consider [migrating to ESM](https://nodejs.org/api/esm.html).

### Quickstart

```bash
# Install
pnpm add --save-dev monocrate
# or: yarn add --dev monocrate
# or: npm install --save-dev monocrate

# Build (monocrate publishes, it doesn't build)
npm run build

# Publish
npx monocrate packages/my-awesome-package --bump patch

# Or use --dry-run to do everything short of publishing
npx monocrate packages/my-awesome-package --dry-run --output-dir /tmp/inspect --bump patch
```

### What Gets Published

Given this monorepo structure:
```
/path/to/my-monorepo/
└── packages/
    ├── my-awesome-package/
    │   ├── package.json      # name: @acme/my-awesome-package
    │   └── src/
    │       └── index.ts      # import ... from '@acme/internal-utils'
    └── internal-utils/
        ├── package.json      # name: @acme/internal-utils (private)
        └── src/
            └── index.ts
```

Running `npx monocrate packages/my-awesome-package` produces:
```
/tmp/monocrate-xxxxxx/
└── packages/
    └── my-awesome-package/      # preserves the package's path in the monorepo
        ├── package.json         # name: "@acme/my-awesome-package", version: "1.3.0" (the new resolved version)
        ├── dist/
        │   └── index.js         # rewritten:
        │                        # import ... from '../deps/__acme__internal-utils/dist/index.js'
        └── deps/
            └── __acme__internal-utils/  # mangled package name, exact notation may vary.
                └── dist/
                    └── index.js
```

The `deps/` directory is where the files of in-repo dependencies get embedded. Each dependency is placed under a
mangled version of its package name. This avoids name collisions regardless of where packages live in the monorepo.

### Version Resolution

`monocrate` uses **registry-based versioning**: it queries the registry for the latest published version and bumps it
according to your `--bump` flag (`patch`, `minor`, `major`). Your source `package.json` is never modified.

This means you don't need to maintain version numbers in your source code. The registry is the versioning source of
truth, and `monocrate` computes the next version at publish time. Of course, if an exact version is specified
(`--bump 1.7.9`) it is used as-is.

For first-time publishing (when the package doesn't exist in the registry yet), `monocrate` treats the current version
as `0.0.0` and applies the bump—resulting in `0.0.1` for patch, `0.1.0` for minor (the default), or `1.0.0` for major.

If the version to publish to is already set in the package's `package.json` file (via `npm version`, Changesets, Lerna,
etc.), you can use `--bump package` to read the version directly from there:

```bash
npm version minor --no-git-tag-version   # Sets version in package.json
npx monocrate . --bump package           # Uses that version
```

## Examples

```bash
# --bump defaults to "minor", so these two are equivalent:
npx monocrate packages/my-awesome-package --bump minor
npx monocrate packages/my-awesome-package

# Explicit version
npx monocrate packages/my-awesome-package --bump 2.3.0

# Package location is resolved relative to CWD
cd /path/to/my-monorepo/packages
npx monocrate my-awesome-package --bump 2.3.0
```

## Programmatic API

For custom build steps, or integration with other tooling, you can use `monocrate` as a library instead of invoking the
CLI:

```typescript
import { monocrate } from 'monocrate'

const result = await monocrate({
  pathToSubjectPackages: ['packages/my-awesome-package'],
  publish: true,
  bump: 'minor',
  cwd: process.cwd()
})

console.log(result.summaries[0].version) // '1.3.0'
```

The above snippet is the programmatic equivalent of `npx monocrate packages/my-awesome-package --bump minor`.

## Advanced Features

### Custom Publish Name

Sometimes your internal package name doesn't match the name you want on npm. Add a `monocrate.publishName` field to 
your `package.json` to publish under a different name without renaming the package across your monorepo:

```json
{
  "name": "@acme/my-awesome-package",
  "monocrate": {
    "publishName": "best-package-ever"
  }
}
```

### Mirroring to a Public Repo

Want to open-source your package while keeping your monorepo private? Use `--mirror-to` to copy the package and its
in-repo dependencies to a separate public repository:

```bash
npx monocrate packages/my-awesome-package --mirror-to ../public-repo
```

This way, your public repo stays in sync with what you publish—all necessary packages included. Contributors can
clone and work on your package.

Requires a clean working tree. Only committed files (from `git HEAD`) are mirrored.

### Multiple Packages

If you have several public packages in your monorepo, publish them in one go by listing multiple directories:

```bash
npx monocrate packages/lib-a packages/lib-b --bump patch
```

By default, each package will be published at its own version (individual versioning). If `lib-a` is at `1.0.0` and `lib-b`
is at `2.0.0`, a patch bump publishes them at `1.0.1` and `2.0.1` respectively.

You can also publish all specified packages at the same version (unified versioning, à la AWS SDK v3), by using the 
`--max` flag. This applies the bump to the maximum version and publishes all packages at that version.

```bash
# Now both will be published at 2.0.1 (the max)
npx monocrate packages/lib-a packages/lib-b --bump patch --max
```

This is purely a stylistic choice; correctness is unaffected since in-repo dependencies are always embedded.

## Scope

monocrate makes a few deliberate choices:

- **Runtime dependencies only** — Only `dependencies` are traversed and embedded. `devDependencies` are ignored since 
consumers don't need your build tools.
- **Version conflicts fail early** — If two in-repo packages require different versions of the same third-party 
dependency, monocrate stops with a clear error rather than silently picking one.
- **File selection via `npm pack`** — Your `files` field in package.json is the source of truth for what gets published.
monocrate doesn't introduce its own file configuration.
- **Validates before heavy work** — npm login and other prerequisites are checked upfront, before any file copying 
begins.

A few constraints to be aware of:

- **Dynamic imports must use string literals** — `await import('@pkg/lib')` works; if a dynamic module path like `await import(variable)` is detected, `monocrate` stops with a clear error.
- **Prerelease versions require explicit `--bump`** — `--bump package` expects strict semver (`X.Y.Z`). For prereleases, pass the version explicitly: `--bump 1.0.0-beta.1`.
- **peerDependencies are preserved, not embedded** — As with any package publishing tool, you're responsible for ensuring peer dependencies (in-repo or not) are published and available to consumers.
- **optionalDependencies are preserved, not embedded** — If you list an in-repo package as optional, you're responsible for publishing it separately.
- **Symlinks must stay within monorepo** — Packages symlinked from outside the monorepo root are rejected.
- **Undeclared in-repo imports fail** — If your code imports an in-repo package not listed in `dependencies`, monocrate catches this and fails with a clear error.

## CLI Reference

```
monocrate <packages...> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `packages` | One or more package directories to publish (required) |

### Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--bump` | `-b` | `string` | `minor` | Version bump strategy: `patch`, `minor`, `major`, `package`, or explicit semver (e.g., `2.3.0`). Use `package` to read version from `package.json`. |
| `--max` | | `boolean` | `false` | Use max version across all packages (unified versioning). When false, each package uses its own version. |
| `--dry-run` | `-d` | `boolean` | `false` | Prepare the package without publishing to npm |
| `--output-dir` | `-o` | `string` | (temp dir) | Directory where assembled package is written |
| `--root` | `-r` | `string` | (auto) | Monorepo root directory (auto-detected if omitted) |
| `--mirror-to` | `-m` | `string` | — | Mirror source files to a directory (for public repos) |
| `--report` | | `string` | — | Write resolved version to a file instead of stdout |
| `--help` | | | | Show help |
| `--version` | | | | Show version number |


## API Reference

### `monocrate(options): Promise<MonocrateResult>`

Assembles one or more monorepo packages and their in-repo dependencies, and optionally publishes to npm.

### `MonocrateOptions`

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `pathToSubjectPackages` | `string \| string[]` | Yes | — | Package directories to assemble. Relative paths resolved from `cwd`. |
| `publish` | `boolean` | Yes | — | Whether to publish to npm after assembly. |
| `cwd` | `string` | Yes | — | Base directory for resolving relative paths. |
| `bump` | `string` | No | `"minor"` | Version specifier: `"patch"`, `"minor"`, `"major"`, `"package"`, or explicit semver. |
| `max` | `boolean` | No | `false` | Use max version across all packages (unified versioning). |
| `outputRoot` | `string` | No | (temp dir) | Output directory for the assembled package. |
| `monorepoRoot` | `string` | No | (auto) | Monorepo root directory; auto-detected if omitted. |
| `mirrorTo` | `string` | No | — | Mirror source files to this directory. |
| `npmrcPath` | `string` | No | — | Path to `.npmrc` file for npm authentication. |

### `MonocrateResult`

| Property | Type | Description |
|----------|------|-------------|
| `outputDir` | `string` | Directory where the first package was assembled. |
| `resolvedVersion` | `string \| undefined` | The unified resolved version (only set when `max: true`). |
| `summaries` | `Array<{ packageName: string; outputDir: string; version: string }>` | Details for each assembled package, including its version. |


## The Assembly Process

Here's a conceptual breakdown of the steps that happen at a typical `monocrate` run:

0. **Setup**: Creates a dedicated output directory
1. **Version Resolution**: Computes the new version (see [above](#version-resolution))
2. **Dependency Discovery**: Traverses the dependency graph to find all in-repo packages the package depends on, transitively
3. **File Embedding**: Copies the publishable files (per `npm pack`) of each in-repo dependency into the output directory
4. **Entry Point Resolution**: Examines each package's entry points (respecting `exports` and `main` fields) to compute
the exact file locations that import statements will resolve to
5. **Import Rewriting**: Scans the `.js` and `.d.ts` files, converting imports of workspace packages to relative path
imports (`@acme/internal-utils` becomes `../deps/__acme__internal-utils/dist/index.js`)
6. **Package.json Rewrite**: Sets the resolved version, removes in-repo deps, and adds any third-party deps they brought in

# monocrate

[![npm version](https://img.shields.io/npm/v/monocrate.svg)](https://www.npmjs.com/package/monocrate)
[![CI](https://github.com/moojo-tech/monocrate/actions/workflows/ci.yml/badge.svg)](https://github.com/moojo-tech/monocrate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*Monorepos? Great. Publishing from a monorepo? Comically hard.*

## The Problem

Consider `@acme/my-awesome-package`, which imports `@acme/internal-utils`, a workspace dependency.

Now you want to publish it.

- **Naive approach**: `npm publish` produces an uninstallable package - `@acme/internal-utils` was never published.
- **Publish-all approach** (e.g., [Lerna](https://lerna.js.org/)): Publishes every internal dependency. Now your _internal_ `@acme/internal-utils` is a permanent public API - rename a function there, break consumers you never intended to have.
- **Bundler approach** (e.g., [esbuild](https://esbuild.github.io/)): Produces a self-contained blob, but types and sourcemaps break, and consumers can't tree-shake.

## The Solution

[monocrate](https://www.npmjs.com/package/monocrate) is a publishing CLI that gets this right. It produces a single 
publishable directory containing everything needed from your package and its in-repo dependencies. Essentially, it 
produces a standard npm package that looks like you hand-crafted it for publication.

- 📦 Consumers get one package with exactly the code they need
- 🔒 Internal packages remain unpublished
- ✅ Tree-shaking, sourcemaps, and types all work

### Quickstart

> **⚠️ ESM only** — monocrate requires ES modules and rejects CommonJS packages. If your monorepo uses CommonJS, consider [migrating to ESM](https://nodejs.org/api/esm.html).

```bash
# Install
pnpm add --save-dev monocrate
# or: yarn add --dev monocrate
# or: npm install --save-dev monocrate

# Build first (monocrate publishes, it doesn't build)
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

For a detailed look at how monocrate assembles packages, see [The Assembly Process](docs/assembly-process.md).

### Version Resolution

The `--bump` flag determines the published version. There are three approaches:

| `--bump` value | Source of truth | Example result |
|----------------|-----------------|----------------|
| `patch`/`minor`/`major` | npm registry | 1.2.3 → 1.2.4 |
| `1.8.9` | CLI argument | 1.8.9 |
| `package` | package.json | (whatever's in file) |

**Registry-based** (`patch`, `minor`, `major`): Monocrate queries npm for the latest published version and applies the bump, treating the registry as the source of truth. For first-time publishing, it treats the current version as `0.0.0`—a patch bump gives `0.0.1`, minor gives `0.1.0`, major gives `1.0.0`.

**Explicit** (`1.8.9`) uses the specified version as-is.

**Package-based** (`package`) reads the version from your `package.json`, useful when you manage versions with Changesets, Lerna, or `npm version`.

We find registry-based the most freeing—just decide the bump level at publish time and go. But if your workflow already manages versions in `package.json`, package-based fits right in. Separately, when publishing multiple packages, see [Multiple Packages](#multiple-packages) for unified versioning with `--max`.

In all cases, your source `package.json` is never modified—the resolved version only appears in the assembled output.

```bash
# Registry-based: query npm, bump from latest (default is minor)
npx monocrate packages/my-awesome-package              # bumps minor
npx monocrate packages/my-awesome-package --bump patch

# Explicit: use exact version
npx monocrate packages/my-awesome-package --bump 2.3.0

# Package-based: read from package.json
npm version minor --no-git-tag-version
npx monocrate packages/my-awesome-package --bump package
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

## Reference

### CLI

```
monocrate <packages...> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `packages` | One or more package directories to publish (required) |

#### Options

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


### API

#### `monocrate(options): Promise<MonocrateResult>`

Assembles one or more monorepo packages and their in-repo dependencies, and optionally publishes to npm.

#### `MonocrateOptions`

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

#### `MonocrateResult`

| Property | Type | Description |
|----------|------|-------------|
| `outputDir` | `string` | Directory where the first package was assembled. |
| `resolvedVersion` | `string \| undefined` | The unified resolved version (only set when `max: true`). |
| `summaries` | `Array<{ packageName: string; outputDir: string; version: string }>` | Details for each assembled package, including its version. |

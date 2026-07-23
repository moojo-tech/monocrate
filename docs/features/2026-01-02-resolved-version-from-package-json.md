# Feature One-Pager: Resolved Version from package.json

## Summary

Allow Monodrop to use the version already declared in the subject package's `package.json` as the publish version, instead of requiring users to specify a version via CLI or having Monodrop compute one by bumping the npm-published version.

## Problem

Currently, Monodrop determines the publish version in one of two ways:

1. **Increment keywords** (`--bump patch/minor/major`) - Queries npm for the current published version and increments it
2. **Explicit version** (`--bump 2.3.4`) - Uses the provided version literally

Both approaches require users to specify version information at the CLI level. This doesn't fit workflows where:

- The version is already managed in `package.json` (e.g., by `npm version`, Changesets, Lerna, or manual updates)
- CI/CD pipelines have already computed and written the version to `package.json` in a prior step
- Teams want the source of truth for version to live in the repository, not in CLI invocations

## Proposed Solution

Introduce a new `--bump` value: **`package`** (or **`package.json`**)

```bash
monodrop packages/mylib --bump package
```

When specified, Monodrop reads the `version` field from the subject package's `package.json` and uses it directly as the resolved version.

## User Experience

### Basic Usage

```bash
# Use the version from packages/mylib/package.json
monodrop packages/mylib --bump package
```

If `packages/mylib/package.json` contains `"version": "3.2.1"`, the output package will be published at version `3.2.1`.

### Comparison with Existing Options

| `--bump` value | Version source | Example result |
|----------------|----------------|----------------|
| `patch` | npm registry + increment | `1.2.3` → `1.2.4` |
| `minor` | npm registry + increment | `1.2.3` → `1.3.0` |
| `major` | npm registry + increment | `1.2.3` → `2.0.0` |
| `2.5.0` | CLI argument (literal) | `2.5.0` |
| **`package`** | **package.json file** | whatever is in `package.json` |

### Multiple Packages

When assembling multiple packages:

```bash
monodrop packages/alpha packages/beta --bump package
```

Monodrop reads the version from each package's `package.json` and uses the **maximum version** across all packages (consistent with current multi-package behavior). All packages are published at this unified version.

### Error Cases

| Scenario | Behavior |
|----------|----------|
| `package.json` has no `version` field | Error: "No version found in package.json for \<package-name\>" |
| `version` is not valid semver | Error: "Invalid version '\<value\>' in package.json for \<package-name\>" |

## Example Workflows

### Workflow 1: Manual Version Management

```bash
# Developer bumps version in package.json
npm version minor --no-git-tag-version

# Monodrop uses that version
monodrop . --bump package --publish
```

### Workflow 2: CI/CD with Pre-computed Version

```yaml
# .github/workflows/release.yml
steps:
  - name: Determine version
    run: |
      # Some version calculation logic...
      npm version $COMPUTED_VERSION --no-git-tag-version

  - name: Publish with Monodrop
    run: monodrop packages/mylib --bump package --publish
```

### Workflow 3: Changesets or Similar Tools

```bash
# Changesets has already updated package.json versions
npx changeset version

# Monodrop respects those versions
monodrop packages/core packages/cli --bump package --publish
```

## Why Not Make It the Default?

Using `package.json` version could become the default, but there are reasons to keep the current default (`minor`):

1. **Backward compatibility** - Existing users rely on the auto-increment behavior
2. **Explicit is better** - Users should consciously choose their versioning strategy
3. **Safety** - Auto-increment prevents accidental re-publishing of the same version

A future major version could consider changing the default.

## Open Questions

1. **Naming**: Should the keyword be `package`, `package.json`, `source`, or `local`?
2. **Shorthand**: Should there be a dedicated flag like `--from-package-json` instead of overloading `--bump`?
3. **Validation**: Should Monodrop warn if the `package.json` version is lower than the currently published version?

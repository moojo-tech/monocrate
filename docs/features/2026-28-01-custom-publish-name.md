# Publish Name Feature

## Intent

The publish name feature allows a package to be published to npm with a different name than its internal monorepo name. This enables:

- **Scoped packaging**: Publish an internal package `@myorg/utils` under a different public name `my-public-utils`
- **Name collision avoidance**: When internal package names conflict with existing npm packages
- **Branding flexibility**: Use different names for internal organization vs. public consumption

## Configuration

Add the `monodrop` field to a package's `package.json`:

```json
{
  "name": "@internal/utils",
  "version": "1.0.0",
  "monodrop": {
    "publishName": "my-public-utils"
  }
}
```

When published, the package appears on npm as `my-public-utils` instead of `@internal/utils`.

## How It Works

### Name Mapping

- The `publishName` in `monodrop.publishName` overrides the package `name` field in the published `package.json`
- Internal imports and dependency rewriting use the original package name (`@internal/utils`)
- The published output contains only the `publishName`, not the internal name

Example output:

```
monorepo/
  packages/
    utils/              # internal name: @internal/utils
      package.json      # monodrop.publishName: "my-public-utils"

output/
  package.json          # name: "my-public-utils"
  src/
  index.js
```

### Dependency Updates

Dependencies on the package remain unchanged in consumers:

- If `app` depends on `@internal/utils` in the monorepo, it continues using that name internally
- Import rewriting translates `@internal/utils` to relative paths in the output
- The `publishName` only affects what appears in the final `package.json`'s `name` field

## Validation Rules

Publish names must be unique across the monorepo:

- A publish name cannot match any existing package name in the workspace
- Two packages cannot have the same publish name
- The internal package name is independent and can match other packages' publish names

### Error Messages

```
Error: Package "utils" has publishName "my-utils" which conflicts with an existing package name
```
A package with that internal name already exists.

```
Error: Packages "api" and "sdk" both have publishName "core-lib"
```
Multiple packages are trying to use the same publish name.

## Implementation Details

### Files Involved

- `src/package-json.ts` — Schema definition for `monodrop.publishName`
- `src/validate-publish-names.ts` — Validation of uniqueness constraints
- `src/rewrite-package-json.ts` — Applies `publishName` to output `package.json`

### Processing Order

1. Validate all publish names for conflicts (during package discovery)
2. Rewrite imports using original package names (import rewriting step)
3. Update output `package.json.name` to `publishName` if provided (final assembly)

### No Impact on Other Fields

Only the `name` field is affected. All other package.json fields (`exports`, `main`, `types`, `bin`, etc.) remain unchanged.

## Testing Approach

Validate with:

1. **Uniqueness tests** — Verify conflicts are detected
2. **Integration tests** — Confirm correct name appears in published output
3. **Dependency resolution tests** — Ensure internal dependencies still resolve with original names
4. **Monorepo validation** — Test publish names alongside workspace packages

Example test case:

```typescript
// packages/@internal/utils/package.json
{
  "name": "@internal/utils",
  "monodrop": { "publishName": "utils" }
}

// Published output should have:
// { "name": "utils", ... }

// But internal references use "@internal/utils"
```

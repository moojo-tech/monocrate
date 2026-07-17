# Individual Package Versions

## Intent

When publishing multiple packages from a monorepo, monocrate currently computes a single "resolved version" by taking the maximum of all individual package versions and applying the bump. This ensures version alignment across packages but can lead to large version jumps for packages that were already at lower versions.

The individual package versions feature allows each package to be published at its own resolved version, computed independently from its current published version. This is useful when:

- Packages have divergent version histories and you want to preserve meaningful versioning per package
- You want smaller, incremental version bumps rather than synchronizing all packages to the highest version
- Packages are logically independent and don't need version alignment

## CLI Option

```
--max <boolean>   Use max version across all packages (default: true)
```

**`--max` (default: `true`):** All packages are published at the same version, computed as the maximum of all individual resolved versions. This is the current behavior.

**`--max=false`:** Each package is published at its own individually resolved version based on its current published version.

## How It Works

### Current Behavior (`--max` or `--max=true`)

Given packages with current published versions:
- `pkg-a`: 1.0.0
- `pkg-b`: 2.0.0
- `pkg-c`: 3.0.0

Running `monocrate --bump=patch` computes:
1. pkg-a: 1.0.0 → 1.0.1
2. pkg-b: 2.0.0 → 2.0.1
3. pkg-c: 3.0.0 → 3.0.1
4. **Max:** 3.0.1

All packages are published at **3.0.1**.

### New Behavior (`--max=false`)

Same packages, running `monocrate --bump=patch --max=false`:
1. pkg-a: 1.0.0 → **1.0.1**
2. pkg-b: 2.0.0 → **2.0.1**
3. pkg-c: 3.0.0 → **3.0.1**

Each package is published at its own resolved version.

## Comparison

| Aspect | `--max` (default) | `--max=false` |
|--------|-------------------|---------------|
| Version alignment | All packages same version | Each package independent |
| Version jumps | Can be large for lower-versioned packages | Always incremental |
| Simplicity | One version to track | Multiple versions to track |
| Use case | Coupled packages, release trains | Independent packages, gradual migration |

## Trade-offs

### Unified Versioning (`--max`)

**Pros:**
- Simple mental model: "what version are we on?"
- Easy to correlate issues with releases
- Works well with two-phase publishing (all packages move together)

**Cons:**
- Packages can jump many versions without actual changes
- Version history becomes less meaningful per-package
- A high-versioned package pulls all others up

### Individual Versioning (`--max=false`)

**Pros:**
- Version numbers reflect actual package history
- Smaller, predictable version increments
- No unnecessary version inflation

**Cons:**
- Multiple versions to track across packages
- Harder to answer "which versions work together?"
- May require more careful release coordination

## Implementation Notes

### Version Resolution

With `--max=false`, each `PackageAssembler` uses its own computed version instead of sharing the max:

```
// Current (--max):
versions = [1.0.1, 2.0.1, 3.0.1]
resolvedVersion = max(versions) → 3.0.1
all packages get 3.0.1

// New (--max=false):
pkg-a gets 1.0.1
pkg-b gets 2.0.1
pkg-c gets 3.0.1
```

### Result Structure

The `MonocrateResult` type changes to support per-package versions:

```typescript
// With --max (default)
{
  resolvedVersion: string        // unified version for all packages
  summaries: [{ outputDir, packageName, version }]  // all versions are the same
}

// With --max=false
{
  resolvedVersion: undefined     // not set when using individual versions
  summaries: [{ outputDir, packageName, version }]  // version per package
}
```

### Two-Phase Publishing Interaction

When using `--max=false` with two-phase publishing:
- Phase 1 publishes each package at its own version with `--tag pending`
- Phase 2 moves `latest` tag for each package to its respective version
- Failure handling remains the same: partial Phase 1 failures leave `latest` unchanged

## Example

```bash
# Publish multiple packages, each at its own version
monocrate --publish \
  --path packages/api \
  --path packages/client \
  --path packages/shared \
  --bump patch \
  --max=false

# Output:
# Published api@1.2.4
# Published client@2.0.1
# Published shared@1.0.3
```

## When to Use Each Mode

**Use `--max` (default) when:**
- Packages are tightly coupled and should release together
- You want a simple "current version" for your project
- Using release trains or synchronized versioning

**Use `--max=false` when:**
- Packages are logically independent
- You're migrating from separate repos with existing version histories
- You want version numbers to reflect actual per-package changes
- Avoiding version number inflation matters to you

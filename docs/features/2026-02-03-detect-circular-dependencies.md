# Circular Dependency Detection

## Status: Proposed

Detect circular dependencies in the in-repo package graph and fail early with a clear error message showing the cycle.

---

## Problem

Currently, monocrate silently ignores circular dependencies. When traversing the dependency graph, if a package has already been visited, the code simply returns without processing:

```typescript
function visit(pkg: MonorepoPackage): void {
  if (visited.has(pkg.name)) {
    return  // Silent return - no error, no warning
  }
  // ...
}
```

This means a circular dependency like `A → B → C → A` passes through undetected. The user receives no indication that their dependency structure is problematic, which can lead to:

1. **Unpredictable assembly order** - The order in which packages are processed depends on traversal timing, not a deterministic topological sort
2. **Silent breakage** - Imports may not be rewritten correctly if a cycle causes incomplete traversal
3. **Confusion during debugging** - Runtime errors in the published package are hard to trace back to a circular dependency

---

## Proposed Behavior

Validate that the subgraph rooted at the subject package forms a **Directed Acyclic Graph (DAG)** before proceeding with assembly.

### Detection Timing

Cycle detection happens in `computePackageClosure()`, immediately after starting traversal:

1. Start DFS traversal from subject package
2. Maintain a **path stack** (packages in the current traversal path)
3. If a package is encountered that's already in the path stack → **cycle detected**
4. If a package is encountered that's already in `visited` but not in the path stack → **not a cycle** (already processed via different branch)
5. Throw error before any file I/O occurs

### Error Message Format

The error message clearly shows the packages forming the cycle:

```
Circular dependency detected:
  @myorg/app → @myorg/lib → @myorg/utils → @myorg/app

Monocrate cannot assemble packages with circular dependencies.
```

### Which Traversals to Check

Only the **runtime traversal** needs cycle detection:

| Phase | Includes | Check for Cycles? |
|-------|----------|-------------------|
| Runtime (`runtimeMembers`) | `dependencies` only | **Yes** - these packages ship to consumers |
| Compile-time (`compiletimeMembers`) | `dependencies` + `devDependencies` | No - devDeps are stripped from output |

A cycle in devDependencies doesn't affect the published package. If someone has a devDependency cycle in their monorepo, that's a local tooling concern outside monocrate's scope.

---

## Algorithm

The standard approach for cycle detection in DFS is to track a "recursion stack" (current path) separately from the visited set:

```
visited: Set of all packages we've finished processing
path: Set of packages in the current DFS path (ancestors)

function visit(pkg):
    if pkg in path:
        // Cycle! pkg is an ancestor of itself
        throw error with cycle path

    if pkg in visited:
        // Already processed via different branch, skip
        return

    path.add(pkg)
    visited.add(pkg)

    for each dependency of pkg:
        visit(dependency)

    path.remove(pkg)  // Backtrack
```

To report the cycle path, we also need to track the traversal order. Options:

1. **Array as path** - Use `path: string[]` instead of `Set`. On cycle, slice from the first occurrence to get the cycle.
2. **Parent map** - Store `parent: Map<string, string>` and reconstruct path on error.

Option 1 is simpler and sufficient for our case (dependency graphs are typically shallow).

---

## Implementation Location

All changes are in `src/compute-package-closure.ts`:

1. Add a `path: string[]` parameter to track current traversal path
2. Check if `pkg.name` exists in `path` before processing
3. On cycle detection, format error message showing `[...path, pkg.name]`
4. Remove from `path` after processing children (backtrack)

The `traverse()` function signature changes from:

```typescript
function traverse(
  root: MonorepoPackage,
  includeDevDeps: boolean,
  thirdPartyVersions?: Map<string, VersionInfo[]>
): Map<string, MonorepoPackage>
```

To include path tracking internally (no signature change needed - path is internal state).

---

## Test Cases

### Detect direct cycle (A → B → A)

```typescript
// packages/a depends on packages/b
// packages/b depends on packages/a
expect(() => computePackageClosure('@test/a', explorer))
  .toThrow('Circular dependency detected')
```

### Detect indirect cycle (A → B → C → A)

```typescript
// packages/a → packages/b → packages/c → packages/a
expect(() => computePackageClosure('@test/a', explorer))
  .toThrow('@test/a → @test/b → @test/c → @test/a')
```

### Self-dependency (A → A)

```typescript
// packages/a depends on itself
expect(() => computePackageClosure('@test/a', explorer))
  .toThrow('@test/a → @test/a')
```

### Cycle in devDependencies only (allowed)

```typescript
// packages/a devDepends on packages/b
// packages/b depends on packages/a
// No cycle in runtime dependencies - should succeed
expect(() => computePackageClosure('@test/a', explorer))
  .not.toThrow()
```

### Diamond dependency (no cycle)

```typescript
// a → b → d
// a → c → d
// This is NOT a cycle - d is visited twice but via different paths
expect(() => computePackageClosure('@test/a', explorer))
  .not.toThrow()
```

### Cycle not reachable from subject package

```typescript
// Subject: @test/a → @test/b (no cycle from a)
// Elsewhere: @test/x → @test/y → @test/x (cycle exists but not in a's subgraph)
// Should succeed - we only check the subgraph rooted at the subject
expect(() => computePackageClosure('@test/a', explorer))
  .not.toThrow()
```

---

## Edge Cases

### Multiple cycles in the same graph

Report the first cycle encountered (DFS order). We don't need to find all cycles - one is enough to fail the build.

### Cycle through third-party package

Not possible. Third-party packages are not traversed (they're external to the monorepo). The cycle must be entirely within in-repo packages.

### Workspace protocol in cycle

```json
{
  "dependencies": {
    "@myorg/lib": "workspace:*"
  }
}
```

Workspace protocol dependencies are resolved to in-repo packages, so they participate in cycle detection normally.

---

## Migration Impact

This is a **breaking change** for users who have circular dependencies in their monorepos. However:

1. Circular dependencies are almost always unintentional
2. The error message clearly explains what's wrong and which packages are involved
3. Fixing circular dependencies improves code health regardless of monocrate

No deprecation period - fail immediately with a clear error.

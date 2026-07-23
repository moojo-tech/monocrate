# Two Phase Publishing

## Intent

When publishing multiple packages from a monorepo, a failure partway through can leave packages at misaligned versions. Since monodrop packages are self-contained (each includes its in-repo dependencies), this isn't a compatibility problem—but it creates confusion when "the current version" differs across packages. Two phase publishing keeps all packages aligned: either they all move to the new version, or none do.

Note: This approach reduces the risk of misalignment but does not provide true atomicity. Failures during Phase 2 can still leave some packages updated and some not.

## How It Works

### Phase 1: Publish with `pending` tag

All packages are published with `--tag pending` instead of the default `latest`:

```
npm publish --tag pending  # pkg-a@2.0.0
npm publish --tag pending  # pkg-b@2.0.0
npm publish --tag pending  # pkg-c@2.0.0
```

At this point, `latest` still points to the previous versions. Users running `npm install pkg-a` get the old stable version.

### Phase 2: Move `latest` tag

Only after all publishes succeed, the `latest` tag is moved to the new versions:

```
npm dist-tag add pkg-a@2.0.0 latest
npm dist-tag add pkg-b@2.0.0 latest
npm dist-tag add pkg-c@2.0.0 latest
```

## Failure Scenarios

**If Phase 1 fails:**
- Some packages may be published under `pending` tag
- `latest` remains unchanged for all packages
- Users are unaffected; they continue getting the previous stable versions
- The `pending` tag will be overwritten on retry

**If Phase 2 fails:**
- All packages are published under `pending`
- Some packages may have `latest` updated, others not
- This is a smaller window of opportunity for misalignment than before, but misalignment is still possible

## Implementation

The `NpmClient` class has two methods: `publish(dir, tag)` publishes with a specified tag, and `distTagAdd(packageNameAtVersion, tag, cwd)` moves a tag to point to an existing version. The orchestration in `monodrop.ts` loops through assemblers twice—first to publish all packages with the `pending` tag, then (only if all succeed) to move `latest` to each package.

## Dist Tags After Publishing

After a successful publish, packages have both tags pointing to the same version. The `pending` tag remains as an artifact but causes no harm—it will be overwritten on the next publish.

## Comparison: Before vs After

**Before:**
```
pkg-a: publish → latest ✓
pkg-b: publish → latest ✓
pkg-c: publish → FAILS!
Result: pkg-a and pkg-b at 2.0.0, pkg-c at 1.0.0
```

**After:**
```
pkg-a: publish → pending ✓
pkg-b: publish → pending ✓
pkg-c: publish → FAILS!
Result: All packages stay at 1.0.0
```

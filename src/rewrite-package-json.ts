import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PackageJson } from './package-json.js'
import type { PackageClosure } from './package-closure.js'
import type { AbsolutePath } from './paths.js'

/**
 * Builds the base rewritten package.json (without dependencies) from the closure's subject package.
 */
function buildBasePackageJson(closure: PackageClosure, version: string | undefined): PackageJson {
  const subject = closure.runtimeMembers.find((at) => at.name === closure.subjectPackageName)
  if (!subject) {
    throw new Error(`Inconsistency in subject package name: "${closure.subjectPackageName}"`)
  }

  const { dependencies: _1, devDependencies: _2, monocrate: _3, ...rest } = subject.packageJson

  const rewritten: PackageJson = {
    ...rest,
    name: subject.publishAs,
  }

  if (version) {
    rewritten.version = version
  }

  return rewritten
}

function addBundledDependencies(rewritten: PackageJson, closure: PackageClosure): void {
  const bundled = closure.runtimeMembers.filter((pkg) => pkg.name !== closure.subjectPackageName).map((pkg) => pkg.name)

  const existingBundled = rewritten.bundledDependencies ?? rewritten.bundleDependencies ?? []
  const mergedBundled = [...new Set([...existingBundled, ...bundled])]

  if (mergedBundled.length > 0) {
    rewritten.bundledDependencies = mergedBundled
    delete rewritten.bundleDependencies
  }
}

function inRepoRuntimeDeps(closure: PackageClosure): Partial<Record<string, string>> {
  return Object.fromEntries(
    closure.runtimeMembers
      .filter((pkg) => pkg.name !== closure.subjectPackageName)
      .map((pkg) => [pkg.name, pkg.packageJson.version ?? '*'])
  )
}

/**
 * Writes a package.json suitable for `npm pack`. In-repo deps are listed in `dependencies`
 * so that npm includes their node_modules/ directories in the tarball via `bundledDependencies`.
 */
export function writePackageJsonForPacking(
  closure: PackageClosure,
  version: string | undefined,
  outputDir: AbsolutePath
) {
  const rewritten = buildBasePackageJson(closure, version)

  const mergedDependencies = { ...closure.allThirdPartyDeps, ...inRepoRuntimeDeps(closure) }
  if (Object.keys(mergedDependencies).length > 0) {
    rewritten.dependencies = mergedDependencies
  }

  addBundledDependencies(rewritten, closure)

  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n')
}

/**
 * Writes the consumer-facing package.json. In-repo deps are excluded from `dependencies` so
 * that yarn v1 (and other package managers with the same bug) does not try to resolve them from
 * the registry. The bundled node_modules/ in the tarball still provides them at runtime.
 *
 * yarn v1 tries to resolve every `dependencies` entry from the registry — even when the
 * package is listed in `bundledDependencies` — and fails when in-repo packages don't exist
 * there. Removing them from `dependencies` avoids this entirely.
 *
 * See: https://github.com/yarnpkg/yarn/issues/5998
 * See: https://github.com/yarnpkg/yarn/issues/8436
 */
export function writePackageJsonForConsumers(
  closure: PackageClosure,
  version: string | undefined,
  outputDir: AbsolutePath
) {
  const rewritten = buildBasePackageJson(closure, version)

  if (Object.keys(closure.allThirdPartyDeps).length > 0) {
    rewritten.dependencies = { ...closure.allThirdPartyDeps }
  }

  // bundledDependencies is intentionally omitted. It was needed in the packing phase to tell
  // npm pack to include in-repo deps in the tarball. In the consumer-facing package.json it
  // must be absent: yarn v1 treats bundledDependencies entries as packages it must resolve
  // from the registry, which fails for in-repo packages that were never published separately.
  // The in-repo deps' files are already baked into the tarball from the packing phase and
  // Node.js resolution finds them in the nested node_modules/ at runtime.
  delete rewritten.bundledDependencies
  delete rewritten.bundleDependencies

  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n')
}

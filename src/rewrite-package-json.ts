import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PackageJson } from './package-json.js'
import type { PackageClosure } from './package-closure.js'
import type { AbsolutePath } from './paths.js'

export function rewritePackageJson(closure: PackageClosure, version: string | undefined, outputDir: AbsolutePath) {
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

  // In-repo deps use file: protocol versions pointing at their bundled location. This is
  // critical for yarn v1 compatibility: yarn v1 tries to resolve all `dependencies` entries
  // from the registry — even bundled ones — and fails when in-repo packages don't exist there.
  // The file: protocol tells yarn v1 to resolve locally instead of hitting the registry.
  // See: https://github.com/yarnpkg/yarn/issues/5998
  // See: https://github.com/yarnpkg/yarn/issues/8436
  const inRepoRuntimeDeps = Object.fromEntries(
    closure.runtimeMembers
      .filter((pkg) => pkg.name !== closure.subjectPackageName)
      .map((pkg) => [pkg.name, `file:./node_modules/${pkg.name}`])
  )
  const mergedDependencies = { ...closure.allThirdPartyDeps, ...inRepoRuntimeDeps }
  if (Object.keys(mergedDependencies).length > 0) {
    rewritten.dependencies = mergedDependencies
  }

  const bundled = closure.runtimeMembers.filter((pkg) => pkg.name !== closure.subjectPackageName).map((pkg) => pkg.name)

  const existingBundled = rewritten.bundledDependencies ?? rewritten.bundleDependencies ?? []
  const mergedBundled = [...new Set([...existingBundled, ...bundled])]

  if (mergedBundled.length > 0) {
    rewritten.bundledDependencies = mergedBundled
    delete rewritten.bundleDependencies
  }

  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n')
}

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

  // Third-party deps go in dependencies
  if (Object.keys(closure.allThirdPartyDeps).length > 0) {
    rewritten.dependencies = { ...closure.allThirdPartyDeps }
  }

  // In-repo deps go in devDependencies. npm requires bundled packages to be declared in
  // dependencies or devDependencies, but yarn v1 tries to resolve all dependencies entries from
  // the registry — even bundled ones. Using devDependencies avoids this: yarn v1 ignores
  // devDependencies of installed packages entirely, so no registry lookups occur.
  const inRepoRuntimeDeps = Object.fromEntries(
    closure.runtimeMembers
      .filter((pkg) => pkg.name !== closure.subjectPackageName)
      .map((pkg) => [pkg.name, pkg.packageJson.version ?? '*'])
  )
  if (Object.keys(inRepoRuntimeDeps).length > 0) {
    rewritten.devDependencies = inRepoRuntimeDeps
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

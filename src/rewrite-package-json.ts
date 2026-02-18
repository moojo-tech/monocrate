import * as fs from 'node:fs'
import * as path from 'node:path'
import type { PackageJson } from './package-json.js'
import type { PackageClosure } from './package-closure.js'
import type { AbsolutePath, RelativePath } from './paths.js'

export function rewritePackageJson(
  closure: PackageClosure,
  version: string | undefined,
  outputDir: AbsolutePath,
  embeddedDepsDir: RelativePath
) {
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

  // Replace dependencies with flattened third-party deps (no workspace deps)
  const inRepoMembers = closure.runtimeMembers.filter((pkg) => pkg.name !== closure.subjectPackageName)

  const inRepoRuntimeDeps = Object.fromEntries(
    inRepoMembers.map((pkg) => {
      const dependencyPath = path.posix.join(embeddedDepsDir, pkg.name)
      return [pkg.name, `file:./${dependencyPath}`]
    })
  )
  const mergedDependencies = { ...closure.allThirdPartyDeps, ...inRepoRuntimeDeps }
  if (Object.keys(mergedDependencies).length > 0) {
    rewritten.dependencies = mergedDependencies
  }

  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n')
}

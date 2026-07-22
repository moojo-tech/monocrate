import * as fs from 'node:fs'
import * as path from 'node:path'
import { DEPS_DIR } from './collect-package-locations.js'
import type { PackageJson } from './package-json.js'
import type { PackageClosure } from './package-closure.js'
import type { AbsolutePath } from './paths.js'

export function rewritePackageJson(closure: PackageClosure, version: string | undefined, outputDir: AbsolutePath) {
  const subject = closure.runtimeMembers.find((at) => at.name === closure.subjectPackageName)
  if (!subject) {
    throw new Error(`Incosistency in subject package name: "${closure.subjectPackageName}"`)
  }

  const { dependencies: _1, devDependencies: _2, monopush: _3, ...rest } = subject.packageJson

  const rewritten: PackageJson = {
    ...rest,
    name: subject.publishAs,
  }

  if (version) {
    rewritten.version = version
  }

  // Replace dependencies with the flattened third-party deps. In-repo deps must NOT appear here:
  // package managers resolve everything listed in `dependencies` from the registry, where in-repo
  // packages don't exist, so installs would fail (see docs/approaches-considered.md). The
  // manager-matrix install tests in tests/publish.test.ts guard this.
  if (Object.keys(closure.allThirdPartyDeps).length > 0) {
    rewritten.dependencies = closure.allThirdPartyDeps
  }

  // If the package has a files field and has in-repo dependencies, add deps/ to files
  // Otherwise npm pack will exclude the deps/ directory from the tarball
  const hasInRepoDeps = closure.runtimeMembers.length > 1
  if (rewritten.files && hasInRepoDeps) {
    rewritten.files = [...rewritten.files, DEPS_DIR]
  }

  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n')
}

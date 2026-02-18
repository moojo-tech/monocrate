import * as fs from 'node:fs'
import * as path from 'node:path'
import { PackageJson } from './package-json.js'
import type { PackageClosure } from './package-closure.js'
import type { AbsolutePath } from './paths.js'

export function rewritePackageJson(
  closure: PackageClosure,
  version: string | undefined,
  outputDir: AbsolutePath,
  depsDirName: string
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

  // Replace dependencies with flattened third-party deps and file: references for in-repo deps
  const inRepoDeps = closure.runtimeMembers.filter((pkg) => pkg.name !== closure.subjectPackageName)
  const inRepoRuntimeDeps = Object.fromEntries(inRepoDeps.map((pkg) => [pkg.name, `file:./${depsDirName}/${pkg.name}`]))
  const mergedDependencies = { ...closure.allThirdPartyDeps, ...inRepoRuntimeDeps }
  if (Object.keys(mergedDependencies).length > 0) {
    rewritten.dependencies = mergedDependencies
  }

  // If files property exists, add the deps directory so npm pack includes it in the tarball
  if (rewritten.files && inRepoDeps.length > 0) {
    rewritten.files = [...rewritten.files, depsDirName]
  }

  fs.writeFileSync(path.join(outputDir, 'package.json'), JSON.stringify(rewritten, null, 2) + '\n')
}

/**
 * Rewrites in-repo dependency references in a bundled package's package.json.
 * Replaces workspace: protocol versions with file: protocol paths pointing to
 * the correct relative location within the deps directory.
 */
export function rewriteInRepoDepsInPackageJson(
  packageJsonPath: string,
  thisPackageDir: string,
  inRepoPackageLocations: Map<string, string>
) {
  const raw = fs.readFileSync(packageJsonPath, 'utf-8')
  const parseResult = PackageJson.safeParse(JSON.parse(raw))
  if (!parseResult.success) {
    throw new Error(`Invalid package.json at ${packageJsonPath}: ${parseResult.error.message}`)
  }
  const parsed = parseResult.data

  if (!parsed.dependencies) return

  const rewrittenDeps: Partial<Record<string, string>> = {}
  for (const [depName, depVersion] of Object.entries(parsed.dependencies)) {
    const targetDir = inRepoPackageLocations.get(depName)
    if (targetDir) {
      const relativePath = path.relative(thisPackageDir, targetDir)
      rewrittenDeps[depName] = `file:${relativePath}`
    } else {
      rewrittenDeps[depName] = depVersion
    }
  }

  const rewritten = { ...parsed }
  if (Object.keys(rewrittenDeps).length > 0) {
    rewritten.dependencies = rewrittenDeps
  } else {
    delete rewritten.dependencies
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(rewritten, null, 2) + '\n')
}

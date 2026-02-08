import * as fs from 'node:fs'
import type { PackageLocation } from './package-location.js'
import type { PackageClosure } from './package-closure.js'
import type { MonorepoPackage } from './repo-explorer.js'
import { getFilesToPack } from './get-files-to-pack.js'
import { AbsolutePath, RelativePath } from './paths.js'
import type { NpmClient } from './npm-client.js'

async function createPackageLocation(
  npmClient: NpmClient,
  pkg: MonorepoPackage,
  directoryInOutput: AbsolutePath,
  includeNpmrc: boolean
): Promise<PackageLocation> {
  const filesToCopy = await getFilesToPack(npmClient, pkg.fromDir)

  if (includeNpmrc) {
    // Add .npmrc for the subject package only (npm pack doesn't include config files).
    const npmrcPath = AbsolutePath.join(pkg.fromDir, RelativePath('.npmrc'))
    if (fs.existsSync(npmrcPath)) {
      filesToCopy.push('.npmrc')
    }
  }

  return {
    name: pkg.name,
    fromDir: pkg.fromDir,
    toDir: directoryInOutput,
    filesToCopy,
    packageJson: pkg.packageJson,
  }
}

export async function collectPackageLocations(
  npmClient: NpmClient,
  closure: PackageClosure,
  outputDir: AbsolutePath
): Promise<PackageLocation[]> {
  // TODO(imaman): use promises()
  return Promise.all(
    closure.runtimeMembers.map((dep) =>
      createPackageLocation(
        npmClient,
        dep,
        dep.name === closure.subjectPackageName
          ? outputDir
          : AbsolutePath.join(outputDir, RelativePath('node_modules'), RelativePath(dep.name)),
        dep.name === closure.subjectPackageName
      )
    )
  )
}

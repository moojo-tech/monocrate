import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import * as tar from 'tar'
import type { PackageLocation } from './package-location.js'
import type { PackageClosure } from './package-closure.js'
import type { MonorepoPackage } from './repo-explorer.js'
import { AbsolutePath, RelativePath } from './paths.js'
import type { NpmClient } from './npm-client.js'
import type { TempDirDispenser } from './temp-dir-dispenser.js'

function listFilesRecursively(rootDir: AbsolutePath): Promise<string[]> {
  async function visit(dir: AbsolutePath): Promise<string[]> {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(
      entries.map(async (entry): Promise<string[]> => {
        const absolute = AbsolutePath(path.join(dir, entry.name))
        if (entry.isDirectory()) {
          return visit(absolute)
        }
        if (!entry.isFile()) {
          return []
        }
        const relative = path.relative(rootDir, absolute)
        if (path.isAbsolute(relative)) {
          throw new Error(`Inconsistency: expected ${absolute} to be within ${rootDir}`)
        }
        return [relative]
      })
    )
    return nested.flat()
  }
  return visit(rootDir)
}

async function packAndExtractDirectory(
  npmClient: NpmClient,
  packageDir: AbsolutePath,
  tempDirDispenser: TempDirDispenser
): Promise<AbsolutePath> {
  const tempDir = tempDirDispenser.create()
  const tarball = AbsolutePath.join(tempDir, RelativePath('package.tgz'))
  await npmClient.pack(packageDir, tarball)
  await tar.x({ file: tarball, cwd: tempDir })

  const extracted = AbsolutePath.join(tempDir, RelativePath('package'))
  const stats = await fsPromises.stat(extracted)
  if (!stats.isDirectory()) {
    throw new Error(`Expected ${extracted} to be a directory`)
  }
  return extracted
}

async function createPackageLocation(
  npmClient: NpmClient,
  pkg: MonorepoPackage,
  directoryInOutput: AbsolutePath,
  includeNpmrc: boolean,
  tempDirDispenser: TempDirDispenser
): Promise<PackageLocation> {
  const packed = await packAndExtractDirectory(npmClient, pkg.fromDir, tempDirDispenser)

  const filesToCopy = await listFilesRecursively(packed)

  if (includeNpmrc) {
    // Include .npmrc for the subject package only (npm pack does not include config files).
    const npmrcPath = AbsolutePath.join(pkg.fromDir, RelativePath('.npmrc'))
    if (fs.existsSync(npmrcPath)) {
      const extractedNpmrc = AbsolutePath.join(packed, RelativePath('.npmrc'))
      await fsPromises.copyFile(npmrcPath, extractedNpmrc)
      filesToCopy.push('.npmrc')
    }
  }

  return {
    name: pkg.name,
    fromDir: packed,
    toDir: directoryInOutput,
    filesToCopy,
    packageJson: pkg.packageJson,
  }
}

export async function collectPackageLocations(
  npmClient: NpmClient,
  closure: PackageClosure,
  outputDir: AbsolutePath,
  depsDirName: string,
  tempDirDispenser: TempDirDispenser
): Promise<PackageLocation[]> {
  return Promise.all(
    closure.runtimeMembers.map(async (dep) =>
      createPackageLocation(
        npmClient,
        dep,
        dep.name === closure.subjectPackageName
          ? outputDir
          : AbsolutePath.join(outputDir, RelativePath(depsDirName), RelativePath(dep.name)),
        dep.name === closure.subjectPackageName,
        tempDirDispenser
      )
    )
  )
}

import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { x } from 'tinyexec'
import type { PackageLocation } from './package-location.js'
import type { PackageClosure } from './package-closure.js'
import type { MonorepoPackage } from './repo-explorer.js'
import { AbsolutePath, RelativePath } from './paths.js'
import type { NpmClient } from './npm-client.js'

interface PackDirectory {
  directory: AbsolutePath
  cleanup: () => Promise<void>
}

export interface CollectPackageLocationsResult {
  locations: PackageLocation[]
  cleanup: () => Promise<void>
}

async function findSingleTarballInDirectory(dir: AbsolutePath): Promise<AbsolutePath> {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true })
  const tarballs = entries.flatMap((entry) => (entry.isFile() && entry.name.endsWith('.tgz') ? [entry.name] : []))
  if (tarballs.length !== 1) {
    const found = tarballs.length === 0 ? '<none>' : tarballs.join(', ')
    throw new Error(`Expected exactly one .tgz file in ${dir}, found ${String(tarballs.length)}: ${found}`)
  }

  const onlyTarball = tarballs.at(0)
  if (!onlyTarball) {
    throw new Error(`Inconsistency: expected one tarball in ${dir}`)
  }
  return AbsolutePath.join(dir, RelativePath(onlyTarball))
}

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
  packageName: string
): Promise<PackDirectory> {
  const safeName = packageName.replaceAll('/', '-')
  const tempDir = AbsolutePath(await fsPromises.mkdtemp(path.join(os.tmpdir(), `monocrate-pack-${safeName}-`)))

  try {
    await npmClient.pack(packageDir, tempDir)
    const tarball = await findSingleTarballInDirectory(tempDir)
    await x('tar', ['-xzf', tarball, '-C', tempDir], { throwOnError: true })

    const extracted = AbsolutePath.join(tempDir, RelativePath('package'))
    const stats = await fsPromises.stat(extracted)
    if (!stats.isDirectory()) {
      throw new Error(`Expected ${extracted} to be a directory`)
    }

    return {
      directory: extracted,
      cleanup: async () => {
        await fsPromises.rm(tempDir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await fsPromises.rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

async function createPackageLocation(
  npmClient: NpmClient,
  pkg: MonorepoPackage,
  directoryInOutput: AbsolutePath,
  includeNpmrc: boolean
): Promise<{ location: PackageLocation; cleanup: () => Promise<void> }> {
  const packed = await packAndExtractDirectory(npmClient, pkg.fromDir, pkg.name)

  const filesToCopy = await listFilesRecursively(packed.directory)

  if (includeNpmrc) {
    // Include .npmrc for the subject package only (npm pack does not include config files).
    const npmrcPath = AbsolutePath.join(pkg.fromDir, RelativePath('.npmrc'))
    if (fs.existsSync(npmrcPath)) {
      const extractedNpmrc = AbsolutePath.join(packed.directory, RelativePath('.npmrc'))
      await fsPromises.copyFile(npmrcPath, extractedNpmrc)
      filesToCopy.push('.npmrc')
    }
  }

  return {
    location: {
      name: pkg.name,
      fromDir: packed.directory,
      toDir: directoryInOutput,
      filesToCopy,
      packageJson: pkg.packageJson,
    },
    cleanup: packed.cleanup,
  }
}

export async function collectPackageLocations(
  npmClient: NpmClient,
  closure: PackageClosure,
  outputDir: AbsolutePath
): Promise<CollectPackageLocationsResult> {
  const cleanups: (() => Promise<void>)[] = []

  try {
    const locations = await Promise.all(
      closure.runtimeMembers.map(async (dep) => {
        const created = await createPackageLocation(
          npmClient,
          dep,
          dep.name === closure.subjectPackageName
            ? outputDir
            : AbsolutePath.join(outputDir, RelativePath('node_modules'), RelativePath(dep.name)),
          dep.name === closure.subjectPackageName
        )
        cleanups.push(created.cleanup)
        return created.location
      })
    )

    return {
      locations,
      cleanup: async () => {
        await Promise.all(cleanups.map(async (cleanup) => cleanup()))
      },
    }
  } catch (error) {
    await Promise.all(cleanups.map(async (cleanup) => cleanup()))
    throw error
  }
}

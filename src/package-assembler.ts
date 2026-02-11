import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import { collectPackageLocations } from './collect-package-locations.js'
import { FileCopier } from './file-copier.js'
import { resolveVersion } from './resolve-version.js'
import { rewritePackageJson } from './rewrite-package-json.js'
import type { VersionSpecifier } from './version-specifier.js'
import { AbsolutePath, RelativePath } from './paths.js'
import type { RepoExplorer, MonorepoPackage } from './repo-explorer.js'
import { computePackageClosure } from './compute-package-closure.js'
import type { NpmClient } from './npm-client.js'
import type { TempDirRegistry } from './temp-dir-registry.js'
import { findSingleTarballInDirectory } from './tarball.js'

export class PackageAssembler {
  readonly pkgName
  readonly publishAs
  private readonly pathInRepo

  constructor(
    private readonly npmClient: NpmClient,
    private readonly explorer: RepoExplorer,
    private readonly fromDir: AbsolutePath,
    private readonly outputRoot: AbsolutePath,
    private readonly tempDirs: TempDirRegistry
  ) {
    const found = this.explorer.listPackages().find((at) => at.fromDir === fromDir)
    if (!found) {
      throw new Error(`Unrecognized package source dir: "${this.fromDir}"`)
    }
    this.pkgName = found.name
    this.publishAs = found.publishAs
    this.pathInRepo = found.pathInRepo
  }

  getOutputDir() {
    return AbsolutePath.join(this.outputRoot, this.pathInRepo)
  }

  async computeNewVersion(versionSpecifier: VersionSpecifier) {
    const packageJsonVersion = this.explorer.getPackage(this.pkgName).packageJson.version
    return await resolveVersion(this.npmClient, this.fromDir, this.pkgName, versionSpecifier, packageJsonVersion)
  }

  private async createFinalTarball(outputDir: AbsolutePath): Promise<AbsolutePath> {
    const tarballRoot = AbsolutePath.join(this.outputRoot, RelativePath('monocrate-final-tarballs'))
    await fsPromises.mkdir(tarballRoot, { recursive: true })
    const packDestination = AbsolutePath(await fsPromises.mkdtemp(path.join(tarballRoot, 'monocrate-final-pack-')))
    await this.npmClient.pack(outputDir, packDestination)
    return findSingleTarballInDirectory(packDestination)
  }

  async assemble(
    newVersion: string | undefined
  ): Promise<{ compiletimeMembers: MonorepoPackage[]; tarballPath: AbsolutePath }> {
    const closure = computePackageClosure(this.pkgName, this.explorer)
    const outputDir = this.getOutputDir()
    const locations = await collectPackageLocations(this.npmClient, closure, outputDir, this.tempDirs)
    const packageMap = new Map(locations.map((at) => [at.name, at] as const))
    await fsPromises.mkdir(outputDir, { recursive: true })
    await new FileCopier(packageMap).copy()

    // This must happen after file copying completes (otherwise the rewritten package.json could be overwritten)
    rewritePackageJson(closure, newVersion, outputDir)
    const tarballPath = await this.createFinalTarball(outputDir)

    return { compiletimeMembers: closure.compiletimeMembers, tarballPath }
  }
}

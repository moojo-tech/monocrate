import * as fsPromises from 'node:fs/promises'
import { collectPackageLocations } from './collect-package-locations.js'
import { FileCopier } from './file-copier.js'
import { resolveVersion } from './resolve-version.js'
import { writePackageJsonForPacking, writePackageJsonForConsumers } from './rewrite-package-json.js'
import type { VersionSpecifier } from './version-specifier.js'
import { AbsolutePath } from './paths.js'
import type { RepoExplorer, MonorepoPackage } from './repo-explorer.js'
import { computePackageClosure } from './compute-package-closure.js'
import type { NpmClient } from './npm-client.js'
import type { TempDirDispenser } from './temp-dir-dispenser.js'
import type { Reporter } from './reporter.js'
import { replaceFileInTarball } from './tarball.js'

export class PackageAssembler {
  readonly pkgName
  readonly publishAs
  private readonly pathInRepo

  constructor(
    private readonly npmClient: NpmClient,
    private readonly explorer: RepoExplorer,
    private readonly fromDir: AbsolutePath,
    private readonly outputRoot: AbsolutePath,
    private readonly tempDirDispenser: TempDirDispenser,
    private readonly report: Reporter
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

  async assemble(newVersion: string, tarballPath: AbsolutePath): Promise<{ compiletimeMembers: MonorepoPackage[] }> {
    const closure = computePackageClosure(this.pkgName, this.explorer)
    const inRepoDeps = closure.runtimeMembers.filter((m) => m.name !== this.pkgName).map((m) => m.name)
    this.report({ type: 'closure', packageName: this.pkgName, inRepoDeps })
    const outputDir = this.getOutputDir()
    const locations = await collectPackageLocations(this.npmClient, closure, outputDir, this.tempDirDispenser)
    const packageMap = new Map(locations.map((at) => [at.name, at] as const))
    await fsPromises.mkdir(outputDir, { recursive: true })
    await new FileCopier(packageMap).copy()

    // Two-phase package.json rewrite:
    // Phase 1: Write with in-repo deps in `dependencies` so npm pack includes them in the
    // tarball via bundledDependencies.
    writePackageJsonForPacking(closure, newVersion, outputDir)
    await this.npmClient.pack(outputDir, tarballPath, { ignoreScripts: true })

    // Phase 2: Replace the package.json inside the tarball with a consumer-facing version
    // that omits in-repo deps from `dependencies`. This prevents yarn v1 from trying to
    // resolve bundled packages from the registry (where they don't exist).
    writePackageJsonForConsumers(closure, newVersion, outputDir)
    replaceFileInTarball(tarballPath, outputDir, 'package.json')

    return { compiletimeMembers: closure.compiletimeMembers }
  }
}

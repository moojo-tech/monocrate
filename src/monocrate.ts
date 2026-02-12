import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { RepoExplorer } from './repo-explorer.js'
import type { MonorepoPackage } from './repo-explorer.js'
import { PackageAssembler } from './package-assembler.js'
import { parseVersionSpecifier } from './version-specifier.js'
import { AbsolutePath, RelativePath } from './paths.js'
import { maxVersion } from './resolve-version.js'
import { NpmClient } from './npm-client.js'
import { mirrorSources } from './mirror-sources.js'
import type { MonocrateResult } from './monocrate-result.js'
import type { MonocrateOptions } from './monocrate-options.js'
import { TempDirRegistry } from './temp-dir-registry.js'

export type { MonocrateOptions } from './monocrate-options.js'
export type { MonocrateResult } from './monocrate-result.js'

function npmTarballFileName(packageName: string, version: string): string {
  return `${packageName.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`
}

/**
 * Assembles a monorepo package and its in-repo dependencies for npm publishing.
 * @param options - Configuration options for the assembly process
 * @returns The result of the assembly operation
 * @throws Error if assembly or publishing fails
 */
export async function monocrate(options: MonocrateOptions): Promise<MonocrateResult> {
  const tempDirs = new TempDirRegistry()

  // Determine whether to use unified max version or individual versions per package
  const useMax = options.max ?? false

  // Resolve and validate cwd first, then use it to resolve all other paths
  const cwd = AbsolutePath(path.resolve(options.cwd))
  const cwdExists = await fs
    .stat(cwd)
    .then(() => true)
    .catch(() => false)
  if (!cwdExists) {
    throw new Error(`cwd does not exist: ${cwd}`)
  }
  const packDestination = AbsolutePath(
    options.packDestination
      ? path.resolve(cwd, options.packDestination)
      : await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-'))
  )

  // Validate bump argument before any side effects (defaults to 'minor')
  const versionSpecifier = parseVersionSpecifier(options.bump ?? 'minor')

  const sources = Array.isArray(options.pathToSubjectPackages)
    ? options.pathToSubjectPackages
    : [options.pathToSubjectPackages]

  const sourceDirs = sources.map((at) => AbsolutePath(path.resolve(cwd, at)))
  const sourceDir0 = sourceDirs.at(0)
  if (!sourceDir0) {
    throw new Error(`At least one package must be specified`)
  }

  const monorepoRoot = options.monorepoRoot
    ? AbsolutePath(path.resolve(cwd, options.monorepoRoot))
    : RepoExplorer.findMonorepoRoot(sourceDir0)
  const explorer = await RepoExplorer.create(monorepoRoot)

  const npmClient = new NpmClient({ userconfig: options.npmrcPath }, tempDirs)

  // Check npm login status early before any heavy operations
  if (options.publish) {
    await npmClient.whoami(cwd)
  }

  try {
    const assemblers = sourceDirs.map((at) => new PackageAssembler(npmClient, explorer, at, packDestination, tempDirs))
    const a0 = assemblers.at(0)
    if (!a0) {
      throw new Error(`Inconsistency - could not find an assembler for the first package`)
    }

    const pairs = await Promise.all(
      assemblers.map(async (a) => ({ assembler: a, version: await a.computeNewVersion(versionSpecifier) }))
    )

    let max = pairs.at(0)?.version
    if (!max) {
      throw new Error('Inconsistency - no versions computed')
    }
    for (const at of pairs) {
      max = maxVersion(max, at.version)
    }

    const packagePlans = pairs.map((at) => {
      const version = useMax ? max : at.version
      const tarballPath = AbsolutePath.join(cwd, RelativePath(npmTarballFileName(at.assembler.publishAs, version)))
      return { assembler: at.assembler, version, tarballPath }
    })
    const allPackagesForMirror = new Map<string, MonorepoPackage>()

    // Phase 1: Assemble all packages and generate their final tarballs.
    // If publishing is enabled, publish each tarball with --tag pending.
    for (const { assembler, version, tarballPath } of packagePlans) {
      const { compiletimeMembers } = await assembler.assemble(version, tarballPath)
      for (const pkg of compiletimeMembers) {
        allPackagesForMirror.set(pkg.name, pkg)
      }

      const outputDir = assembler.getOutputDir()

      if (options.publish) {
        await npmClient.publishTarball(tarballPath, outputDir, 'pending')
      }
    }

    // Phase 2: Move 'latest' tag to all published packages (only if all publishes succeeded)
    if (options.publish) {
      for (const { assembler, version } of packagePlans) {
        await npmClient.distTagAdd(`${assembler.publishAs}@${version}`, 'latest', assembler.getOutputDir())
      }
    }

    // Mirror source files if mirrorTo is specified
    if (options.mirrorTo) {
      const mirrorDir = AbsolutePath(path.resolve(cwd, options.mirrorTo))
      await mirrorSources([...allPackagesForMirror.values()], mirrorDir)
    }

    return {
      packDestination: a0.getOutputDir(),
      resolvedVersion: useMax ? max : undefined,
      summaries: packagePlans.map(({ assembler, version, tarballPath }) => ({
        packDestination: assembler.getOutputDir(),
        packageName: assembler.pkgName,
        version,
        tarballPath,
      })),
    }
  } finally {
    try {
      tempDirs.cleanup()
    } catch {
      // Best-effort cleanup only: temp directory cleanup failure must not mask the main operation result.
    }
  }
}

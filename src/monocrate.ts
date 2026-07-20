import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { RepoExplorer } from './repo-explorer.js'
import type { MonorepoPackage } from './repo-explorer.js'
import { PackageAssembler } from './package-assembler.js'
import { publish } from './publish.js'
import { parseVersionSpecifier } from './version-specifier.js'
import { AbsolutePath } from './paths.js'
import { maxVersion } from './resolve-version.js'
import { NpmClient } from './npm-client.js'
import { mirrorSources } from './mirror-sources.js'
import type { MonocrateResult } from './monocrate-result.js'
import type { MonocrateOptions } from './monocrate-options.js'
import { TempDirDispenser } from './temp-dir-dispenser.js'

export type { MonocrateOptions } from './monocrate-options.js'
export type { MonocrateResult } from './monocrate-result.js'

/**
 * Assembles a monorepo package and its in-repo dependencies for npm publishing.
 * @param options - Configuration options for the assembly process
 * @returns The result of the assembly operation
 * @throws Error if assembly or publishing fails
 */
export async function monocrate(options: MonocrateOptions): Promise<MonocrateResult> {
  // This dispenser is used for the tarballs which are intentionally kept
  const dispenser = new TempDirDispenser()
  return await monocrateImpl(options, dispenser)
}

async function monocrateImpl(options: MonocrateOptions, dispenser: TempDirDispenser): Promise<MonocrateResult> {
  const dynamicImportsPolicy = options.dynamicImportsPolicy ?? 'allow'
  const tarballsDir = options.packDestination ?? options.cwd
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
  const outputRoot = AbsolutePath(
    options.outputRoot ? path.resolve(cwd, options.outputRoot) : await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-'))
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

  const npmClient = new NpmClient(dispenser, { userconfig: options.npmrcPath })

  // Check npm login status early before any heavy operations
  if (options.publish) {
    await npmClient.whoami(cwd)
  }

  const assemblers = sourceDirs.map(
    (at) => new PackageAssembler(npmClient, explorer, at, outputRoot, dynamicImportsPolicy)
  )
  const a0 = assemblers.at(0)
  if (!a0) {
    throw new Error(`Incosistency - could not find an assembler for the first package`)
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

  const resolvedPairs = pairs.map((at) => {
    const version = useMax ? max : at.version
    let pn = at.assembler.publishAs
    if (pn.startsWith('@')) {
      const [a, b] = pn.slice(1).split('/')
      if (!a || !b) {
        throw new Error(`Illegal package name: ${pn}`)
      }

      pn = a + '-' + b
    }
    return { ...at, version, tarballPath: path.join(tarballsDir, `${pn}-${version}.tgz`) }
  })
  const allPackagesForMirror = new Map<string, MonorepoPackage>()

  // Phase 1: Assemble all packages and publish with --tag pending
  for (const { assembler, version, tarballPath } of resolvedPairs) {
    const { compiletimeMembers } = await assembler.assemble(version, tarballPath)
    for (const pkg of compiletimeMembers) {
      allPackagesForMirror.set(pkg.name, pkg)
    }

    if (options.publish) {
      await publish(npmClient, assembler.getOutputDir(), 'pending', options.npmPublishArgs ?? [])
    }
  }

  // Phase 2: Move 'latest' tag to all published packages (only if all publishes succeeded)
  if (options.publish) {
    for (const { assembler, version } of resolvedPairs) {
      await npmClient.distTagAdd(`${assembler.publishAs}@${version}`, 'latest', assembler.getOutputDir())
    }
  }

  // Mirror source files if mirrorTo is specified
  if (options.mirrorTo) {
    const mirrorDir = AbsolutePath(path.resolve(cwd, options.mirrorTo))
    await mirrorSources([...allPackagesForMirror.values()], mirrorDir)
  }

  return {
    outputDir: a0.getOutputDir(),
    resolvedVersion: useMax ? max : undefined,
    summaries: resolvedPairs.map(({ assembler, version, tarballPath }) => ({
      outputDir: assembler.getOutputDir(),
      packageName: assembler.pkgName,
      version,
      tarballPath,
    })),
  }
}

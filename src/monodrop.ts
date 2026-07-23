import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { RepoExplorer } from './repo-explorer.js'
import type { MonorepoPackage } from './repo-explorer.js'
import { PackageAssembler } from './package-assembler.js'
import { parseVersionSpecifier } from './version-specifier.js'
import { AbsolutePath } from './paths.js'
import { maxVersion } from './resolve-version.js'
import { NpmClient } from './npm-client.js'
import { mirrorSources } from './mirror-sources.js'
import type { MonodropResult } from './monodrop-result.js'
import type { MonodropOptions } from './monodrop-options.js'
import { TempDirDispenser } from './temp-dir-dispenser.js'
import { defaultDynamicImportsPolicy } from './default-dynamic-imports-policy.js'

export type { MonodropOptions } from './monodrop-options.js'
export type { MonodropResult } from './monodrop-result.js'

/**
 * Assembles a monorepo package and its in-repo dependencies for npm publishing.
 * @param options - Configuration options for the assembly process
 * @returns The result of the assembly operation
 * @throws Error if assembly or publishing fails
 */
export async function monodrop(options: MonodropOptions): Promise<MonodropResult> {
  const dispenser = new TempDirDispenser()
  try {
    return await monodropImpl(options, dispenser)
  } finally {
    dispenser.cleanup()
  }
}

async function monodropImpl(options: MonodropOptions, dispenser: TempDirDispenser): Promise<MonodropResult> {
  // Resolve and validate cwd first, then use it to resolve all other paths
  const cwd = AbsolutePath(path.resolve(options.cwd))
  const cwdExists = fs.existsSync(cwd)
  if (!cwdExists) {
    throw new Error(`cwd does not exist: ${cwd}`)
  }
  if (!fs.statSync(cwd).isDirectory()) {
    throw new Error(`cwd is not a directory: ${cwd}`)
  }
  const dynamicImportsPolicy = options.dynamicImportsPolicy ?? defaultDynamicImportsPolicy
  const tarballsDir = dispenser.create()

  const packDestinationDir = options.publish ? undefined : path.resolve(cwd, options.packDestination ?? cwd)
  if (packDestinationDir) {
    fs.mkdirSync(packDestinationDir, { recursive: true })
  }

  // Determine whether to use unified max version or individual versions per package
  const useMax = options.max ?? false

  const outputRoot = AbsolutePath(fs.mkdtempSync(path.join(os.tmpdir(), 'monodrop-')))

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
    const name = `${pn}-${version}.tgz`
    const tarballPath = path.join(tarballsDir, name)
    const finalTarballPath = packDestinationDir ? path.join(packDestinationDir, name) : undefined
    return { ...at, version, tarballPath, finalTarballPath }
  })
  const allPackagesForMirror = new Map<string, MonorepoPackage>()

  // Assemble all packages
  for (const { assembler, version, tarballPath, finalTarballPath } of resolvedPairs) {
    const { compiletimeMembers } = await assembler.assemble(version, tarballPath, dispenser)
    for (const pkg of compiletimeMembers) {
      allPackagesForMirror.set(pkg.name, pkg)
    }

    if (finalTarballPath) {
      fs.cpSync(tarballPath, finalTarballPath)
    }
  }

  if (options.publish) {
    if (resolvedPairs.length === 1) {
      const only = resolvedPairs.at(0)
      if (!only) {
        throw new Error('Inconsistency - no packages to publish')
      }
      // Single package: publish directly, skipping the pending phase.
      await npmClient.publish(only.tarballPath, 'latest')
    } else {
      // Otherwise - publish as 'pending' and only if all publishes succeeded move the 'latest' tag.
      for (const { tarballPath } of resolvedPairs) {
        await npmClient.publish(tarballPath, 'pending')
      }
      for (const { assembler, version } of resolvedPairs) {
        await npmClient.distTagAdd(`${assembler.publishAs}@${version}`, 'latest', assembler.getOutputDir())
      }
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
    summaries: resolvedPairs.map(({ assembler, version, finalTarballPath }) => ({
      outputDir: assembler.getOutputDir(),
      packageName: assembler.pkgName,
      version,
      tarballPath: finalTarballPath,
    })),
  }
}

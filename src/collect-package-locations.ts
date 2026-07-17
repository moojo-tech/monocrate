import * as fs from 'node:fs'
import * as ResolveExports from 'resolve.exports'
import type { PackageLocation } from './package-location.js'
import type { PackageClosure } from './package-closure.js'
import type { MonorepoPackage } from './repo-explorer.js'
import { getFilesToPack } from './get-files-to-pack.js'
import { AbsolutePath, RelativePath } from './paths.js'
import type { PackageJson } from './package-json.js'
import type { NpmClient } from './npm-client.js'
import { manglePackageName } from './name-mangler.js'

/** Directory name where in-repo dependencies are placed in the output. */
export const DEPS_DIR = 'deps'

/**
 * Resolves an import specifier to a package-relative path using Node.js resolution semantics.
 * Handles both bare imports (subpath='') and subpath imports (subpath='utils/helper').
 */
export function resolveImport(packageJson: PackageJson, subpath: string): string {
  const entry = subpath === '' ? '.' : `./${subpath}`

  // Try exports field resolution (resolve.exports only handles the exports field, not main)
  const resolved = ResolveExports.resolve(packageJson, entry)
  if (resolved) {
    // The exports field can map to an array of fallback paths. Node.js tries them in order and uses
    // the first "processable" path (e.g., skips unsupported protocols), but does NOT fall back if the
    // file is missing. Picking the first entry matches Node.js behavior.
    // See: https://nodejs.org/api/packages.html#package-entry-points
    const resolvedPath = Array.isArray(resolved) ? resolved[0] : resolved
    if (resolvedPath !== undefined) {
      // If the resolved path starts with './', remove it
      return resolvedPath.startsWith('./') ? resolvedPath.slice(2) : resolvedPath
    }
  }

  // Otherwise (no exports field or no matching export) -
  if (subpath === '') {
    // Bare import (e.g., import ... from '@myorg/pkg'): use main field, then index.js (Node.js default)
    return packageJson.main ?? 'index.js'
  }
  // Subpath import (e.g., import ... from '@myorg/pkg/utils/helper'): subpath relative to package root
  return `${subpath}.js`
}

async function createPackageLocation(
  npmClient: NpmClient,
  pkg: MonorepoPackage,
  directoryInOutput: AbsolutePath
): Promise<PackageLocation> {
  const filesToCopy = await getFilesToPack(npmClient, pkg.fromDir)

  // Add .npmrc if it exists (npm pack doesn't include it since it's a config file)
  const npmrcPath = AbsolutePath.join(pkg.fromDir, RelativePath('.npmrc'))
  if (fs.existsSync(npmrcPath)) {
    filesToCopy.push('.npmrc')
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
          : AbsolutePath.join(outputDir, RelativePath(DEPS_DIR), RelativePath(manglePackageName(dep.name)))
      )
    )
  )
}

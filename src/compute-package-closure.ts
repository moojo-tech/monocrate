import type { MonorepoPackage } from './repo-explorer.js'
import type { RepoExplorer } from './repo-explorer.js'
import type { PackageClosure } from './package-closure.js'

interface VersionInfo {
  version: string
  requiredBy: string
}

function detectVersionConflicts(versionsByDep: Map<string, VersionInfo[]>): Partial<Record<string, string[]>> {
  const conflicts: Partial<Record<string, string[]>> = {}

  for (const [depName, versionInfos] of versionsByDep.entries()) {
    const uniqueVersions = [...new Set(versionInfos.map((v) => v.version))]
    if (uniqueVersions.length > 1) {
      conflicts[depName] = versionInfos.map((v) => `${v.version} (by ${v.requiredBy})`)
    }
  }

  return conflicts
}

function formatConflictError(conflicts: Partial<Record<string, string[]>>): string {
  const lines = ['Third-party dependency version conflicts detected:']

  for (const [depName, versions] of Object.entries(conflicts)) {
    if (versions) {
      lines.push(`  - ${depName}: ${versions.join(', ')}`)
    }
  }

  return lines.join('\n')
}

export function computePackageClosure(pkgName: string, repoExplorer: RepoExplorer): PackageClosure {
  const subjectPackage = repoExplorer.getPackage(pkgName)

  function traverse(
    root: MonorepoPackage,
    includeDevDeps: boolean,
    thirdPartyVersions?: Map<string, VersionInfo[]>
  ): Map<string, MonorepoPackage> {
    const visited = new Map<string, MonorepoPackage>()

    function visit(pkg: MonorepoPackage): void {
      if (visited.has(pkg.name)) {
        return
      }
      visited.set(pkg.name, pkg)

      const deps = includeDevDeps
        ? { ...pkg.packageJson.dependencies, ...pkg.packageJson.devDependencies }
        : pkg.packageJson.dependencies ?? {}

      for (const [depName, depVersion] of Object.entries(deps)) {
        const depPackage = repoExplorer.lookupPackage(depName)
        if (depPackage) {
          visit(depPackage)
        } else if (depVersion?.startsWith('workspace:')) {
          throw new Error(
            `Workspace dependency "${depName}" (${depVersion}) in package "${pkg.name}" was not found in the monorepo`
          )
        } else if (thirdPartyVersions && depVersion) {
          const existing = thirdPartyVersions.get(depName) ?? []
          existing.push({ version: depVersion, requiredBy: pkg.name })
          thirdPartyVersions.set(depName, existing)
        }
      }
    }

    visit(root)
    return visited
  }

  const thirdPartyVersions = new Map<string, VersionInfo[]>()
  const runtimeVisited = traverse(subjectPackage, false, thirdPartyVersions)

  const conflicts = detectVersionConflicts(thirdPartyVersions)
  if (Object.keys(conflicts).length > 0) {
    throw new Error(formatConflictError(conflicts))
  }

  const allThirdPartyDeps: Partial<Record<string, string>> = {}
  for (const [depName, versionInfos] of thirdPartyVersions.entries()) {
    const first = versionInfos[0]
    if (!first) {
      throw new Error(`Internal error: no version info for ${depName}`)
    }
    allThirdPartyDeps[depName] = first.version
  }

  const compiletimeVisited = traverse(subjectPackage, true)

  return {
    subjectPackageName: subjectPackage.name,
    runtimeMembers: [...runtimeVisited.values()],
    compiletimeMembers: [...compiletimeVisited.values()],
    allThirdPartyDeps,
  }
}

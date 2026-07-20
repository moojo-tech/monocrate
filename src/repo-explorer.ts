import * as fs from 'node:fs'
import * as path from 'node:path'
import { glob } from 'tinyglobby'
import yaml from 'yaml'
import { z } from 'zod'
import { PackageJson } from './package-json.js'
import { AbsolutePath, RelativePath } from './paths.js'
import { validatePublishNames } from './validate-publish-names.js'

export interface MonorepoPackage {
  name: string
  publishAs: string
  fromDir: AbsolutePath
  pathInRepo: RelativePath
  packageJson: PackageJson
}

export class RepoExplorer {
  constructor(private readonly map: Map<string, MonorepoPackage>) {
    validatePublishNames(map)
  }

  static async create(monorepoRoot: AbsolutePath) {
    const map = await this.discover(monorepoRoot)

    // Validate all package directories are under the monorepo root
    // Use realpath to resolve symlinks and catch cases where a symlink points outside
    const realMonorepoRoot = AbsolutePath(fs.realpathSync(monorepoRoot))
    for (const pkg of map.values()) {
      const realPkgPath = AbsolutePath(fs.realpathSync(pkg.fromDir))
      if (!AbsolutePath.contains(realMonorepoRoot, realPkgPath)) {
        throw new Error(
          `Package "${pkg.name}" is located at "${realPkgPath}" which is outside the monorepo root "${realMonorepoRoot}"`
        )
      }
    }

    return new RepoExplorer(map)
  }

  listNames() {
    return [...this.map.keys()]
  }
  listPackages() {
    return [...this.map.values()]
  }

  getPackage(pkgName: string) {
    const ret = this.lookupPackage(pkgName)
    if (!ret) {
      throw new Error(`Unrecognized package name: "${pkgName}"`)
    }
    return ret
  }

  lookupPackage(pkgName: string) {
    return this.map.get(pkgName)
  }

  static findMonorepoRoot(startDir: AbsolutePath): AbsolutePath {
    let dir = startDir

    while (dir !== AbsolutePath.dirname(dir)) {
      const packageJsonPath = path.join(dir, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        const parsed = PackageJson.safeParse(JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')))
        if (parsed.success && parsed.data.workspaces !== undefined) {
          return dir
        }
      }

      const pnpmWorkspacePath = path.join(dir, 'pnpm-workspace.yaml')
      if (fs.existsSync(pnpmWorkspacePath)) {
        return dir
      }

      dir = AbsolutePath.dirname(dir)
    }

    throw new Error(`Could not find monorepo root from ${startDir}`)
  }

  private static readPackageJson(packageDir: AbsolutePath): PackageJson {
    const packageJsonPath = path.join(packageDir, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`No package.json found at ${packageDir}`)
    }
    const content: unknown = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    const parsed = PackageJson.safeParse(content)
    if (!parsed.success) {
      throw new Error(`Invalid package.json at ${packageDir}: ${parsed.error.message}`)
    }
    return parsed.data
  }

  private static parseWorkspacePatterns(monorepoRoot: AbsolutePath): string[] {
    const packageJsonPath = path.join(monorepoRoot, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const WorkspacesConfig = z.object({
        workspaces: z.union([z.array(z.string()), z.object({ packages: z.array(z.string()) })]).optional(),
      })
      const parsed = WorkspacesConfig.safeParse(JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')))
      if (!parsed.success) {
        throw new Error(
          `Invalid workspaces field in package.json: expected an array of strings (e.g., ["packages/*"]) or an object with a "packages" array (e.g., { packages: ["packages/*"] })`
        )
      }
      if (parsed.data.workspaces) {
        const workspaces = parsed.data.workspaces
        return Array.isArray(workspaces) ? workspaces : workspaces.packages
      }
    }

    const pnpmWorkspacePath = path.join(monorepoRoot, 'pnpm-workspace.yaml')
    if (fs.existsSync(pnpmWorkspacePath)) {
      const content = fs.readFileSync(pnpmWorkspacePath, 'utf-8')
      const PnpmWorkspace = z.object({ packages: z.array(z.string()) })
      const parsed = PnpmWorkspace.safeParse(yaml.parse(content))
      if (!parsed.success) {
        throw new Error(
          `Invalid pnpm-workspace.yaml: expected a "packages" field with an array of strings (e.g., packages: ["packages/*"])`
        )
      }
      return parsed.data.packages
    }

    return ['packages/*']
  }

  private static async discover(monorepoRoot: AbsolutePath): Promise<Map<string, MonorepoPackage>> {
    const patterns = this.parseWorkspacePatterns(monorepoRoot)
    const globPatterns = patterns.map((p) => path.join(p, 'package.json'))

    const matches = await glob(globPatterns, {
      cwd: monorepoRoot,
      ignore: ['**/node_modules/**'],
    })

    const packages = new Map<string, MonorepoPackage>()
    for (const match of matches) {
      const packageDir = AbsolutePath(path.join(monorepoRoot, path.dirname(match)))
      const packageJson = this.readPackageJson(packageDir)

      if (packageJson.name) {
        packages.set(packageJson.name, {
          name: packageJson.name,
          publishAs: packageJson.monocrate?.publishName ?? packageJson.name,
          fromDir: packageDir,
          pathInRepo: RelativePath(path.dirname(match)),
          packageJson,
        })
      }
    }

    return packages
  }
}

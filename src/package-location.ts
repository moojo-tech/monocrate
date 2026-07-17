import type { PackageJson } from './package-json.js'
import type { AbsolutePath } from './paths.js'

export interface PackageLocation {
  /**
   * The package name from package.json
   * @example "@myorg/utils"
   */
  name: string

  /**
   * Absolute path to the package's directory in the repo.
   * @example "/home/user/monorepo/packages/my-package"
   */
  fromDir: AbsolutePath

  /**
   * Absolute path to the the package's output directory
   * @example "/tmp/monocrate-ab00003/deps/__myorg__my-package" (in-repo dependency)
   */
  toDir: AbsolutePath

  /**
   * Individual file paths (relative to the package dir) to copy, as determined by `npm pack --dry-run`.
   * These are the exact files npm would include in the published tarball.
   * @example ["dist/index.js", "dist/utils.js", "package.json"]
   */
  filesToCopy: string[]

  /**
   * The package.json contents, used for import resolution
   */
  packageJson: PackageJson
}

export type PackageMap = Map<string, PackageLocation>

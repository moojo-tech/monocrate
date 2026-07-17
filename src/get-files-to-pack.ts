import type { AbsolutePath } from './paths.js'
import type { NpmClient } from './npm-client.js'

/**
 * Gets the list of files that npm would include in a package tarball.
 * Uses `npm pack --dry-run --json` to get npm's exact file selection.
 *
 * @param packageDir - Absolute path to the package directory
 * @returns Array of relative file paths that npm would include
 * @example getFilesToPack("/home/user/my-package") => ["dist/index.js", "README.md", "package.json"]
 */
export async function getFilesToPack(npmClient: NpmClient, packageDir: AbsolutePath): Promise<string[]> {
  const o = await npmClient.pack(packageDir, { dryRun: true })
  if (o.length !== 1) {
    throw new Error(`Expected npm pack to return a single element array`)
  }

  const at0 = o.at(0)
  if (at0 === undefined) {
    throw new Error('npm pack returned empty output')
  }

  return at0.files.map((f) => f.path)
}

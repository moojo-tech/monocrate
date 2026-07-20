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
  const { files } = await npmClient.pack(packageDir, { dryRun: true })
  return files.map((f) => f.path)
}

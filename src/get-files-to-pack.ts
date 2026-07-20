import path from 'path'
import * as Tar from 'tar'
import { AbsolutePath } from './paths.js'
import type { NpmClient } from './npm-client.js'
import type { TempDirDispenser } from './temp-dir-dispenser.js'

/**
 * Gets the list of files that npm would include in a package tarball.
 * Uses `npm pack --dry-run --json` to get npm's exact file selection.
 *
 * @param packageDir - Absolute path to the package directory
 * @returns Array of relative file paths that npm would include
 * @example getFilesToPack("/home/user/my-package") => ["dist/index.js", "README.md", "package.json"]
 */
export async function getFilesToPack(npmClient: NpmClient, packageDir: AbsolutePath, dispenser: TempDirDispenser) {
  const packRes = await npmClient.pack(packageDir, { dryRun: false, ignoreScripts: false })

  const d = dispenser.create()
  await Tar.extract({ file: packRes.tarballPath, gzip: true, cwd: d })

  const files = packRes.files.map((f) => f.path)
  return { files, dir: AbsolutePath(path.join(d, 'package')) }
}

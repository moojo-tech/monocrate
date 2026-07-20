import path from 'path'
import * as Tar from 'tar'
import { AbsolutePath } from './paths.js'
import type { NpmClient } from './npm-client.js'
import type { TempDirDispenser } from './temp-dir-dispenser.js'

/**
 * Gets the list of files that npm would include in a package tarball. Under the hood uses `npm pack` to build this
 * list from the package's tarball.
 *
 * @param packageDir - Absolute path to the package directory
 * @returns an object which lists relative file paths that npm includes, and the directory to resolve these relative
 * paths from.
 */
export async function getFilesToPack(npmClient: NpmClient, packageDir: AbsolutePath, dispenser: TempDirDispenser) {
  const packRes = await npmClient.pack(packageDir, { ignoreScripts: false })

  const d = dispenser.create()
  await Tar.extract({ file: packRes.tarballPath, gzip: true, cwd: d })

  const files = packRes.files.map((f) => f.path)
  return { files, dir: AbsolutePath(path.join(d, 'package')) }
}

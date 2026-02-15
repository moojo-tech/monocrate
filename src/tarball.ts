import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import * as tar from 'tar'
import { AbsolutePath, RelativePath } from './paths.js'

export async function findSingleTarballInDirectory(dir: AbsolutePath): Promise<AbsolutePath> {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true })
  const tarballs = entries.flatMap((entry) => (entry.isFile() && entry.name.endsWith('.tgz') ? [entry.name] : []))
  if (tarballs.length !== 1) {
    const found = tarballs.length === 0 ? '<none>' : tarballs.join(', ')
    throw new Error(`Expected exactly one .tgz file in ${dir}, found ${String(tarballs.length)}: ${found}`)
  }

  const onlyTarball = tarballs.at(0)
  if (!onlyTarball) {
    throw new Error(`Inconsistency: expected one tarball in ${dir}`)
  }
  return AbsolutePath.join(dir, RelativePath(onlyTarball))
}

/**
 * Replaces a single file inside an npm tarball (`.tgz`). The tarball is extracted to a temporary
 * directory, the file at `package/<fileName>` is overwritten with the copy from `sourceDir`,
 * and the tarball is recreated in-place.
 */
export function replaceFileInTarball(tarballPath: AbsolutePath, sourceDir: AbsolutePath, fileName: string): void {
  const extractDir = AbsolutePath(path.join(path.dirname(tarballPath), '.tarball-rewrite'))
  fs.mkdirSync(extractDir, { recursive: true })

  try {
    tar.extract({ file: tarballPath, cwd: extractDir, sync: true })

    const sourceFile = path.join(sourceDir, fileName)
    const targetFile = path.join(extractDir, 'package', fileName)
    fs.copyFileSync(sourceFile, targetFile)

    tar.create({ file: tarballPath, cwd: extractDir, gzip: true, sync: true }, ['package'])
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
}

import * as fsPromises from 'node:fs/promises'
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

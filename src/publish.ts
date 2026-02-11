import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { AbsolutePath } from './paths.js'
import { findSingleTarballInDirectory } from './tarball.js'

interface TarballNpmClient {
  pack(dir: AbsolutePath, packDestination: AbsolutePath): Promise<void>
  publishTarball(tarballPath: AbsolutePath, cwd: AbsolutePath, tag?: string): Promise<void>
}

export async function createFinalTarball(
  npmClient: TarballNpmClient,
  outputDir: AbsolutePath,
  tarballRoot: AbsolutePath
): Promise<AbsolutePath> {
  await fs.mkdir(tarballRoot, { recursive: true })
  const packDestination = AbsolutePath(await fs.mkdtemp(path.join(tarballRoot, 'monocrate-final-pack-')))
  await npmClient.pack(outputDir, packDestination)
  return findSingleTarballInDirectory(packDestination)
}

export async function publishTarball(
  npmClient: TarballNpmClient,
  tarball: AbsolutePath,
  cwd: AbsolutePath,
  tag: string
): Promise<void> {
  await npmClient.publishTarball(tarball, cwd, tag)
}

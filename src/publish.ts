import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { TempDirRegistry } from './temp-dir-registry.js'
import { AbsolutePath } from './paths.js'
import { findSingleTarballInDirectory } from './tarball.js'

interface PublisherNpmClient {
  pack(dir: AbsolutePath, packDestination: AbsolutePath): Promise<void>
  publishTarball(tarballPath: AbsolutePath, cwd: AbsolutePath, tag?: string): Promise<void>
}

export async function publish(
  npmClient: PublisherNpmClient,
  outputDir: AbsolutePath,
  tag: string,
  tempDirs: TempDirRegistry
) {
  const packDestination = tempDirs.record(
    AbsolutePath(await fs.mkdtemp(path.join(os.tmpdir(), 'monocrate-final-pack-')))
  )
  await npmClient.pack(outputDir, packDestination)
  const tarball = await findSingleTarballInDirectory(packDestination)
  await npmClient.publishTarball(tarball, outputDir, tag)
}

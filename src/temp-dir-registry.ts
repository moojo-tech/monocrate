import * as fsPromises from 'node:fs/promises'
import type { AbsolutePath } from './paths.js'

export class TempDirRegistry {
  private readonly directories = new Set<AbsolutePath>()

  record(directory: AbsolutePath): AbsolutePath {
    this.directories.add(directory)
    return directory
  }

  async cleanup(): Promise<void> {
    const all = [...this.directories]
    this.directories.clear()
    await Promise.all(
      all.map(async (directory) => {
        await fsPromises.rm(directory, { recursive: true, force: true })
      })
    )
  }
}

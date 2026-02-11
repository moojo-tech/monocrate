import * as fs from 'node:fs'
import type { AbsolutePath } from './paths.js'

export class TempDirRegistry {
  private readonly directories = new Set<AbsolutePath>()

  record(directory: AbsolutePath): AbsolutePath {
    this.directories.add(directory)
    return directory
  }

  cleanup(): void {
    for (const directory of [...this.directories]) {
      if (!fs.existsSync(directory)) {
        continue
      }
      fs.rmSync(directory, { recursive: true, force: true })
      this.directories.delete(directory)
    }
  }
}

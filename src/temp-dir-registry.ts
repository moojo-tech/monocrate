import * as fs from 'node:fs'
import type { AbsolutePath } from './paths.js'

export class TempDirRegistry {
  private readonly directories = new Set<AbsolutePath>()

  record(directory: AbsolutePath): AbsolutePath {
    this.directories.add(directory)
    return directory
  }

  cleanup(): void {
    const all = [...this.directories]
    this.directories.clear()
    for (const directory of all) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
}

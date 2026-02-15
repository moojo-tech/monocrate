import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { AbsolutePath } from './paths.js'

export class TempDirRegistry {
  private readonly directories = new Set<AbsolutePath>()

  private record(directory: AbsolutePath): AbsolutePath {
    this.directories.add(directory)
    return directory
  }

  create(prefix: string): AbsolutePath {
    const dir = AbsolutePath(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
    return this.record(dir)
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

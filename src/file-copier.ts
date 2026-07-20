import fs from 'fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import type { PackageMap } from './package-location.js'
import { AbsolutePath, RelativePath } from './paths.js'

interface CopyOperation {
  source: AbsolutePath
  destination: AbsolutePath
}

export class FileCopier {
  constructor(private packageMap: PackageMap) {}

  async copy(): Promise<AbsolutePath[]> {
    const operations = this.collectCopyOperations()

    // Phase 1: Collect and create unique directories
    const directories = new Set(operations.map((op) => path.dirname(op.destination)))
    for (const dir of directories) {
      await fsPromises.mkdir(dir, { recursive: true })
    }

    // Phase 2: Copy all files
    const copiedFiles: AbsolutePath[] = []
    for (const op of operations) {
      fs.copyFileSync(op.source, op.destination)
      copiedFiles.push(op.destination)
    }
    return copiedFiles
  }

  private collectCopyOperations(): CopyOperation[] {
    const operations: CopyOperation[] = []

    for (const location of this.packageMap.values()) {
      for (const at of location.filesToCopy) {
        operations.push({
          source: AbsolutePath.join(location.fromDir, RelativePath(at)),
          destination: AbsolutePath.join(location.toDir, RelativePath(at)),
        })
      }
    }

    return operations
  }
}

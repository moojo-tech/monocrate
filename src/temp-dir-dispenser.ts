import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { AbsolutePath } from './paths.js'

export class TempDirDispenser {
  private readonly prefix: string
  private root: AbsolutePath | undefined

  constructor(prefix = 'monocrate-') {
    this.prefix = prefix
  }

  private getOrCreateRoot(): AbsolutePath {
    this.root ??= AbsolutePath(fs.mkdtempSync(path.join(os.tmpdir(), this.prefix)))
    return this.root
  }

  create(): AbsolutePath {
    const root = this.getOrCreateRoot()
    const dir = AbsolutePath(path.join(root, crypto.randomUUID()))
    fs.mkdirSync(dir)
    return dir
  }

  cleanup(): void {
    if (this.root === undefined) {
      return
    }
    if (fs.existsSync(this.root)) {
      fs.rmSync(this.root, { recursive: true, force: true })
    }
    this.root = undefined
  }
}

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AbsolutePath } from './paths.js'

/**
 * Creates a uniquely named deps directory in the output location.
 *
 * @param outputDir - The output directory where the deps directory will be created
 * @returns The deps directory name (basename only)
 */
export function createDepsDir(outputDir: AbsolutePath): string {
  const createdDir = fs.mkdtempSync(path.join(outputDir, 'deps-'))
  return path.basename(createdDir)
}

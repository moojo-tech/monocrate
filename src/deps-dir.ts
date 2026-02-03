import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AbsolutePath } from './paths.js'

/** Default directory name for in-repo dependencies. */
const DEFAULT_DEPS_DIR = 'deps'

/**
 * Checks if the subject package files contain a top-level 'deps' directory.
 */
function hasDepsDirCollision(subjectFiles: string[]): boolean {
  for (const file of subjectFiles) {
    const topDir = file.split('/')[0]
    if (topDir === DEFAULT_DEPS_DIR) {
      return true
    }
  }
  return false
}

/**
 * Computes or creates a unique deps directory name that won't collide with existing directories.
 * If the subject package already has a 'deps' directory, creates a uniquely named directory
 * using the filesystem's mkdtemp function.
 *
 * @param subjectFiles - Array of file paths from the subject package (relative paths from npm pack)
 * @param outputDir - The output directory where the deps directory will be created
 * @returns A deps directory name that won't collide with existing directories
 */
export function computeDepsDir(subjectFiles: string[], outputDir: AbsolutePath): string {
  if (!hasDepsDirCollision(subjectFiles)) {
    return DEFAULT_DEPS_DIR
  }

  // Use mkdtempSync to create a uniquely named directory in the output location
  const createdDir = fs.mkdtempSync(path.join(outputDir, `${DEFAULT_DEPS_DIR}-`))
  return path.basename(createdDir)
}

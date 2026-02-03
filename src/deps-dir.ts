import * as crypto from 'node:crypto'

/** Default directory name for in-repo dependencies. */
const DEFAULT_DEPS_DIR = 'deps'

/**
 * Computes a unique deps directory name that won't collide with existing directories.
 * If the subject package already has a 'deps' directory, generates a unique name.
 *
 * @param subjectFiles - Array of file paths from the subject package (relative paths from npm pack)
 * @returns A deps directory name that won't collide with existing directories
 */
export function computeDepsDir(subjectFiles: string[]): string {
  const existingDirs = new Set<string>()

  for (const file of subjectFiles) {
    // Extract the top-level directory from file paths (e.g., "deps/foo/bar.js" -> "deps")
    const topDir = file.split('/')[0]
    if (topDir !== undefined) {
      existingDirs.add(topDir)
    }
  }

  if (!existingDirs.has(DEFAULT_DEPS_DIR)) {
    return DEFAULT_DEPS_DIR
  }

  // Generate a unique suffix using random bytes
  const uniqueSuffix = crypto.randomBytes(4).toString('hex')
  return `${DEFAULT_DEPS_DIR}-${uniqueSuffix}`
}

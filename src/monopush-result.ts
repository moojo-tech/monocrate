// TODO(imaman): reflect in the type system that tarballPath is not available on publish
export interface MonopushResult {
  /**
   * The output directory path where the assembly of the first package was created.
   */
  outputDir: string
  /**
   * The unified version for all packages. Only set when using unified versioning (--max).
   * When using individual versioning (the default), this is undefined and each package's version
   * can be found in its respective summary entry.
   */
  resolvedVersion?: string
  /**
   * Details about each individual package that was assembled/published.
   * tarballPath is the tarball copied to the pack destination; it is undefined when publishing,
   * as the tarball is deleted once publishing completes.
   */
  summaries: { packageName: string; outputDir: string; version: string; tarballPath?: string }[]
}

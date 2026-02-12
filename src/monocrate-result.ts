export interface MonocrateResult {
  /**
   * The directory path where the assembly of the first package was created.
   */
  packDestination: string
  /**
   * The unified version for all packages. Only set when using unified versioning (--max).
   * When using individual versioning (the default), this is undefined and each package's version
   * can be found in its respective summary entry.
   */
  resolvedVersion?: string
  /**
   * Details about each individual package that was assembled/published.
   */
  summaries: { packageName: string; packDestination: string; version: string; tarballPath: string }[]
}

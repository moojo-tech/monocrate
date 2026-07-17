import { z } from 'zod'

export const MonocrateConfig = z
  .object({
    publishName: z.string().optional(),
  })
  .optional()

export const PackageJson = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    main: z.string().optional(),
    source: z.string().optional(),
    types: z.string().optional(),
    dependencies: z.partialRecord(z.string(), z.string()).optional(),
    devDependencies: z.partialRecord(z.string(), z.string()).optional(),
    peerDependencies: z.partialRecord(z.string(), z.string()).optional(),
    optionalDependencies: z.partialRecord(z.string(), z.string()).optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    author: z.union([z.string(), z.object({ name: z.string(), email: z.string().optional() })]).optional(),
    license: z.string().optional(),
    repository: z.union([z.string(), z.object({ type: z.string(), url: z.string() })]).optional(),
    homepage: z.string().optional(),
    bugs: z.union([z.string(), z.object({ url: z.string().optional(), email: z.string().optional() })]).optional(),
    engines: z.partialRecord(z.string(), z.string()).optional(),
    bin: z.union([z.string(), z.partialRecord(z.string(), z.string())]).optional(),
    type: z.enum(['module', 'commonjs']).optional(),
    workspaces: z.union([z.array(z.string()), z.object({ packages: z.array(z.string()) })]).optional(),
    files: z.array(z.string()).optional(),
    monocrate: MonocrateConfig,
  })
  .loose()

export type PackageJson = z.infer<typeof PackageJson>

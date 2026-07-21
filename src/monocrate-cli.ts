import * as fs from 'node:fs'
import * as path from 'node:path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import type { MonocrateOptions } from './monocrate.js'
import { monocrate } from './monocrate.js'
import { defaultDynamicImportsPolicy } from './default-dynamic-imports-policy.js'

export function monocrateCli(): void {
  const parser = yargs(hideBin(process.argv))
    .scriptName('monocrate')
    .usage(
      `From monorepo to npm in one command.

Point at your packages. That's it.

Usage: $0 [options]`
    )
    .example('$0 pkg/foo --bump patch', 'Bump to next patch and publish')
    .example('$0 libs/a libs/b', 'Multi-package (defaults to minor bump)')
    .example('$0 pkg/foo --dry-run', 'Prepare without publishing')
    .example('$0 pkg/foo --bump package', 'Use version from package.json')
    .options({
      packages: {
        describe: 'Package directories to publish',
        type: 'string',
        array: true,
      },
      bump: {
        alias: 'b',
        type: 'string' as const,
        description: 'Version, increment (patch/minor/major), or "package" to use package.json version',
      },
      'pack-destination': {
        type: 'string' as const,
        description: 'Directory where the tarball(s) to publish will be placed at',
      },
      root: {
        alias: 'r',
        type: 'string' as const,
        description: 'Monorepo root (auto-detected if omitted)',
      },
      report: {
        type: 'string' as const,
        description: 'Write report to file',
      },
      'mirror-to': {
        alias: 'm',
        type: 'string' as const,
        description: 'Mirror source files to directory',
      },
      'dry-run': {
        alias: 'd',
        type: 'boolean' as const,
        description: 'Prepare without publishing',
        default: false,
      },
      max: {
        type: 'boolean' as const,
        description: 'Use max version across all packages (default: false)',
        default: false,
      },
      'dynamic-imports-policy': {
        choices: ['allow', 'reject'] as const,
        description:
          'How to treat dynamic import() calls with computed (non-literal) module names: "reject" fails the packaging process, "allow" leaves them as-is',
        default: defaultDynamicImportsPolicy,
      },
    })
    .strict()
    .help()
    .option('help', { hidden: true })

  void Promise.resolve(parser.parse())
    .then(async (args) => {
      const packages = args.packages ?? []

      if (packages.length === 0) {
        throw new Error('At least one package directory must be specified')
      }
      const options: MonocrateOptions = {
        pathToSubjectPackages: packages,
        monorepoRoot: args.root,
        bump: args.bump,
        publish: !args.dryRun,
        cwd: process.cwd(),
        mirrorTo: args.mirrorTo,
        max: args.max,
        packDestination: args.packDestination,
        dynamicImportsPolicy: args.dynamicImportsPolicy,
      }
      const result = await monocrate(options)
      const output = result.resolvedVersion ?? result.summaries.map((s) => `${s.packageName}@${s.version}`).join('\n')
      if (args.report) {
        const outputFilePath = path.resolve(process.cwd(), args.report)
        fs.writeFileSync(outputFilePath, output)
      } else {
        console.log(output)
      }
    })
    .catch((error: unknown) => {
      console.error('Fatal error:', error instanceof Error ? error.stack : error)
      process.exit(1)
    })
}

import * as fs from 'node:fs'
import * as path from 'node:path'
import yargs from 'yargs'
import type { Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'
import type { MonodropOptions } from './monodrop.js'
import { monodrop } from './monodrop.js'
import { defaultDynamicImportsPolicy } from './default-dynamic-imports-policy.js'

const addSharedOptions = (y: Argv) =>
  y
    .positional('packages', {
      describe: 'Package directories to assemble',
      type: 'string',
      array: true,
      demandOption: true,
    })
    .options({
      bump: {
        alias: 'b',
        type: 'string' as const,
        description: 'Version, increment (patch/minor/major), or "package" to use package.json version',
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

async function runMonodrop(options: MonodropOptions, report: string | undefined): Promise<void> {
  const result = await monodrop(options)
  const output = result.resolvedVersion ?? result.summaries.map((s) => `${s.packageName}@${s.version}`).join('\n')
  if (report) {
    const outputFilePath = path.resolve(process.cwd(), report)
    fs.writeFileSync(outputFilePath, output)
  } else {
    console.log(output)
  }
}

export function monodropCli(): void {
  const parser = yargs(hideBin(process.argv))
    .scriptName('monodrop')
    .usage(
      `From monorepo to npm in one command.

Point at your packages. That's it.

Usage: $0 <command> [options]`
    )
    .command(
      'publish <packages...>',
      'Assemble package(s) with their in-repo dependencies and publish to npm',
      (y) => addSharedOptions(y),
      (args) =>
        runMonodrop(
          {
            pathToSubjectPackages: args.packages,
            monorepoRoot: args.root,
            bump: args.bump,
            publish: true,
            cwd: process.cwd(),
            mirrorTo: args.mirrorTo,
            max: args.max,
            dynamicImportsPolicy: args.dynamicImportsPolicy,
          },
          args.report
        )
    )
    .command(
      'pack <packages...>',
      'Assemble package(s) and create tarball(s) without publishing',
      (y) =>
        addSharedOptions(y).option('pack-destination', {
          type: 'string' as const,
          description: 'Directory where publishable tarball(s) will be placed',
        }),
      (args) =>
        runMonodrop(
          {
            pathToSubjectPackages: args.packages,
            monorepoRoot: args.root,
            bump: args.bump,
            publish: false,
            cwd: process.cwd(),
            mirrorTo: args.mirrorTo,
            max: args.max,
            packDestination: args.packDestination,
            dynamicImportsPolicy: args.dynamicImportsPolicy,
          },
          args.report
        )
    )
    .example('$0 publish pkg/foo --bump patch', 'Bump to next patch and publish')
    .example('$0 publish libs/a libs/b', 'Multi-package (defaults to minor bump)')
    .example('$0 pack pkg/foo', 'Prepare without publishing')
    .example('$0 publish pkg/foo --bump package', 'Use version from package.json')
    .demandCommand(1, 'Specify a command: publish or pack')
    .strict()
    .help()
    .option('help', { hidden: true })

  void parser.parseAsync().catch((error: unknown) => {
    console.error('Fatal error:', error instanceof Error ? error.stack : error)
    process.exit(1)
  })
}

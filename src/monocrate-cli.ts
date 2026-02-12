import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import type { MonocrateOptions } from './monocrate.js'
import { monocrate } from './monocrate.js'

function findPackageJson(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(dir, 'package.json')
    if (fs.existsSync(candidate)) {
      return candidate
    }
    dir = path.dirname(dir)
  }
  throw new Error('Could not find package.json')
}

const pkg = JSON.parse(fs.readFileSync(findPackageJson(), 'utf-8')) as { version: string }

interface YargsArgs {
  _: string[]
  packages?: string[]
  'pack-destination'?: string
  root?: string
  bump?: string
  report?: string
  'mirror-to'?: string
  max?: boolean
}

export function monocrateCli(): void {
  const parser = yargs(hideBin(process.argv))
    .scriptName('monocrate')
    .version(pkg.version)
    .command(
      'pack <packages...>',
      `Assemble one or more packages into publishable output without publishing.`,
      (yargs) =>
        yargs.positional('packages', {
          describe: 'Package directories to create tarballs for',
          type: 'string',
          array: true,
          demandOption: true,
        })
    )
    .command('publish <packages...>', `Assemble one or more packages and publish them to npm.`, (yargs) =>
      yargs.positional('packages', {
        describe: 'Package directories to publish',
        type: 'string',
        array: true,
        demandOption: true,
      })
    )
    .demandCommand(1)
    .strictCommands()
    .example('$0 publish pkg/foo --bump patch', 'Bump to next patch and publish')
    .example('$0 publish libs/a libs/b', 'Multi-package publish (defaults to minor bump)')
    .example('$0 pack pkg/foo --pack-destination /tmp/inspect', 'Assemble without publishing')
    .example('$0 publish pkg/foo --bump package', 'Use version from package.json and publish')
    .options({
      bump: {
        alias: 'b',
        type: 'string' as const,
        description: 'Version, increment (patch/minor/major), or "package" to use package.json version',
      },
      'pack-destination': {
        alias: 'o',
        type: 'string' as const,
        description: 'Directory where assembled package is written',
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
    })
    .strict()
    .help()
    .option('help', { hidden: true })

  void Promise.resolve(parser.parse())
    .then(async (argv) => {
      const args = argv as YargsArgs
      const packages = args.packages ?? args._
      const command = args._[0]
      if (command !== 'pack' && command !== 'publish') {
        throw new Error(`Expected command to be "pack" or "publish", got ${String(command)}`)
      }
      const options: MonocrateOptions = {
        pathToSubjectPackages: packages,
        outputRoot: args['pack-destination'],
        monorepoRoot: args.root,
        bump: args.bump,
        publish: command === 'publish',
        cwd: process.cwd(),
        mirrorTo: args['mirror-to'],
        max: args.max,
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

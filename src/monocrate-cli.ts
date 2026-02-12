import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import type { Arguments, Argv } from 'yargs'
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
  packages: string[]
  'pack-destination'?: string
  root?: string
  bump?: string
  report?: string
  'mirror-to'?: string
  max: boolean
}

function withCommandOptions(parser: Argv): Argv<YargsArgs> {
  return parser
    .positional('packages', {
      describe: 'Package directories to publish',
      type: 'string',
      array: true,
      demandOption: true,
    })
    .option('bump', {
      alias: 'b',
      type: 'string',
      description: 'Version, increment (patch/minor/major), or "package" to use package.json version',
    })
    .option('pack-destination', {
      alias: 'o',
      type: 'string',
      description: 'Directory where assembled package is written',
    })
    .option('root', {
      alias: 'r',
      type: 'string',
      description: 'Monorepo root (auto-detected if omitted)',
    })
    .option('report', {
      type: 'string',
      description: 'Write report to file',
    })
    .option('mirror-to', {
      alias: 'm',
      type: 'string',
      description: 'Mirror source files to directory',
    })
    .option('max', {
      type: 'boolean',
      description: 'Use max version across all packages (default: false)',
      default: false,
    })
}

async function runCommand(args: Arguments<YargsArgs>, publish: boolean): Promise<void> {
  const options: MonocrateOptions = {
    pathToSubjectPackages: args.packages,
    outputRoot: args['pack-destination'],
    monorepoRoot: args.root,
    bump: args.bump,
    publish,
    cwd: process.cwd(),
    mirrorTo: args['mirror-to'],
    max: args.max,
  }
  const result = await monocrate(options)
  const output = result.resolvedVersion ?? result.summaries.map((s) => `${s.packageName}@${s.version}`).join('\n')
  if (args.report) {
    const outputFilePath = path.resolve(process.cwd(), args.report)
    fs.writeFileSync(outputFilePath, output)
    return
  }
  console.log(output)
}

export function monocrateCli(): void {
  const parser = yargs(hideBin(process.argv))
    .scriptName('monocrate')
    .version(pkg.version)
    .command<YargsArgs>(
      'pack <packages...>',
      `Assemble one or more packages into publishable output without publishing.`,
      (yargs) =>
        withCommandOptions(yargs).positional('packages', { describe: 'Package directories to create tarballs for' }),
      async (args) => runCommand(args, false)
    )
    .command<YargsArgs>(
      'publish <packages...>',
      `Assemble one or more packages and publish them to npm.`,
      (yargs) => withCommandOptions(yargs),
      async (args) => runCommand(args, true)
    )
    .demandCommand(1)
    .strictCommands()
    .example('$0 publish pkg/foo --bump patch', 'Bump to next patch and publish')
    .example('$0 publish libs/a libs/b', 'Multi-package publish (defaults to minor bump)')
    .example('$0 pack pkg/foo --pack-destination /tmp/inspect', 'Assemble without publishing')
    .example('$0 publish pkg/foo --bump package', 'Use version from package.json and publish')
    .strict()
    .help()
    .option('help', { hidden: true })

  void parser.parseAsync().catch((error: unknown) => {
    console.error('Fatal error:', error instanceof Error ? error.stack : error)
    process.exit(1)
  })
}

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

interface CommonYargsArgs {
  packages: string[]
  root?: string
  bump?: string
  'output-json'?: string
  'mirror-to'?: string
  max: boolean
}

interface PackYargsArgs extends CommonYargsArgs {
  'pack-destination'?: string
}

function withCommonCommandOptions(parser: Argv, packageDescription: string): Argv<CommonYargsArgs> {
  return parser
    .positional('packages', {
      describe: packageDescription,
      type: 'string',
      array: true,
      demandOption: true,
    })
    .option('bump', {
      alias: 'b',
      type: 'string',
      description: 'Version, increment (patch/minor/major), or "package" to use package.json version',
    })
    .option('root', {
      alias: 'r',
      type: 'string',
      description: 'Monorepo root (auto-detected if omitted)',
    })
    .option('output-json', {
      type: 'string',
      description: 'Write full result as JSON to file',
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

function withPackCommandOptions(parser: Argv): Argv<PackYargsArgs> {
  return withCommonCommandOptions(parser, 'Package directories to create tarballs for').option('pack-destination', {
    alias: 'd',
    type: 'string',
    description: 'Directory to write tarballs to',
  })
}

async function runCommand(args: Arguments<CommonYargsArgs>, publish: boolean, packDestination?: string): Promise<void> {
  const options: MonocrateOptions = {
    pathToSubjectPackages: args.packages,
    packDestination,
    monorepoRoot: args.root,
    bump: args.bump,
    publish,
    cwd: process.cwd(),
    mirrorTo: args['mirror-to'],
    max: args.max,
  }
  const result = await monocrate(options)
  if (args['output-json']) {
    const outputFilePath = path.resolve(process.cwd(), args['output-json'])
    fs.writeFileSync(outputFilePath, JSON.stringify(result, undefined, 2) + '\n')
    return
  }
  const output = result.resolvedVersion ?? result.summaries.map((s) => `${s.packageName}@${s.version}`).join('\n')
  console.log(output)
}

export function monocrateCli(): void {
  const parser = yargs(hideBin(process.argv))
    .scriptName('monocrate')
    .version(pkg.version)
    .command<PackYargsArgs>(
      'pack <packages...>',
      `Create publish-ready tarball(s) without publishing to npm.`,
      (yargs) => withPackCommandOptions(yargs),
      async (args) => runCommand(args, false, args['pack-destination'])
    )
    .command<CommonYargsArgs>(
      'publish <packages...>',
      `Publish one or more packages to npm.`,
      (yargs) => withCommonCommandOptions(yargs, 'Package directories to publish'),
      async (args) => runCommand(args, true)
    )
    .demandCommand(1)
    .strictCommands()
    .example('$0 publish pkg/foo --bump patch', 'Bump to next patch and publish')
    .example('$0 publish libs/a libs/b', 'Multi-package publish (defaults to minor bump)')
    .example('$0 pack pkg/foo --pack-destination /tmp/inspect', 'Create tarballs without publishing')
    .example('$0 publish pkg/foo --bump package', 'Use version from package.json and publish')
    .strict()
    .help()
    .option('help', { hidden: true })

  void parser.parseAsync().catch((error: unknown) => {
    console.error('Fatal error:', error instanceof Error ? error.stack : error)
    process.exit(1)
  })
}

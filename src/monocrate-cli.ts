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

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readPackages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected packages to be an array')
  }
  const packages: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error('Expected all package paths to be strings')
    }
    packages.push(item)
  }
  return packages
}

function readCommand(value: unknown): 'pack' | 'publish' {
  if (value === 'pack' || value === 'publish') {
    return value
  }
  throw new Error(`Expected command to be "pack" or "publish", got ${String(value)}`)
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
          describe: 'Package directories to assemble',
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
      const packages = readPackages(argv.packages)
      const command = readCommand(argv._[0])
      const options: MonocrateOptions = {
        pathToSubjectPackages: packages,
        outputRoot: readOptionalString(argv['pack-destination']),
        monorepoRoot: readOptionalString(argv.root),
        bump: readOptionalString(argv.bump),
        publish: command === 'publish',
        cwd: process.cwd(),
        mirrorTo: readOptionalString(argv['mirror-to']),
        max: readBoolean(argv.max, false),
      }
      const result = await monocrate(options)
      const output = result.resolvedVersion ?? result.summaries.map((s) => `${s.packageName}@${s.version}`).join('\n')
      const report = readOptionalString(argv.report)
      if (report) {
        const outputFilePath = path.resolve(process.cwd(), report)
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

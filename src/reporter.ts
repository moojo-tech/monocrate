import * as path from 'node:path'

export type ReporterEvent =
  | { type: 'monorepoRoot'; root: string }
  | { type: 'npmLogin'; username: string }
  | { type: 'closure'; packageName: string; inRepoDeps: string[] }
  | { type: 'version'; packageName: string; version: string }
  | { type: 'assemble'; packageName: string; version: string }
  | { type: 'publish'; packageName: string; version: string }
  | { type: 'tagLatest'; packageName: string; version: string }
  | { type: 'pack'; packageName: string; tarballPath: string }

export type Reporter = (event: ReporterEvent) => void

function shouldNeverHappen(n: never): never {
  throw new Error(`Unexpected event: ${JSON.stringify(n)}`)
}

export function createSilentReporter(): Reporter {
  return () => {}
}

function formatEvent(event: ReporterEvent): string {
  switch (event.type) {
    case 'monorepoRoot':
      return `📍 root      ${event.root}`
    case 'npmLogin':
      return `📍 login     ${event.username}`
    case 'closure':
      return `📍 closure   ${event.packageName} -> ${event.inRepoDeps.join(' -> ')}`
    case 'version':
      return `📍 version   ${event.packageName} ${event.version}`
    case 'assemble':
      return `📍 assemble  ${event.packageName}@${event.version}`
    case 'publish':
      return `📡 publish   ${event.packageName}@${event.version}`
    case 'tagLatest':
      return `🏷️  latest    ${event.packageName}@${event.version}`
    case 'pack':
      return `📦 pack      ${path.basename(event.tarballPath)}`
    default:
      shouldNeverHappen(event)
  }
}

export function createConsoleReporter(): Reporter {
  return (event) => {
    console.log(formatEvent(event))
  }
}

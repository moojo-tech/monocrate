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

export function createSilentReporter(): Reporter {
  return () => {}
}

function formatEvent(event: ReporterEvent): string {
  if (event.type === 'monorepoRoot') {
    return `📍 root      ${event.root}`
  }
  if (event.type === 'npmLogin') {
    return `📍 login     ${event.username}`
  }
  if (event.type === 'closure') {
    return `📍 closure   ${event.packageName} -> ${event.inRepoDeps.join(' -> ')}`
  }
  if (event.type === 'version') {
    return `📍 version   ${event.packageName} ${event.version}`
  }
  if (event.type === 'assemble') {
    return `📍 assemble  ${event.packageName}@${event.version}`
  }
  if (event.type === 'publish') {
    return `📡 publish   ${event.packageName}@${event.version}`
  }
  if (event.type === 'tagLatest') {
    return `🏷️  latest    ${event.packageName}@${event.version}`
  }
  return `📦 pack      ${path.basename(event.tarballPath)}`
}

export function createConsoleReporter(): Reporter {
  return (event) => {
    console.log(formatEvent(event))
  }
}

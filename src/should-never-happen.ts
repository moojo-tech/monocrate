export function shouldNeverHappen(n: never): never {
  throw new Error(`Unexpected event: ${JSON.stringify(n)}`)
}

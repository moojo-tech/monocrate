export function manglePackageName(name: string): string {
  return name.replace(/[@/]/g, '__')
}

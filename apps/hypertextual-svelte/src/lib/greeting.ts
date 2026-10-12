export function greeting(name: string): string {
  const trimmedName = name.trim()
  return `hello ${trimmedName || 'hypertextual-svelte'}!`
}

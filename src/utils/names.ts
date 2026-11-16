/** The surname (last word) in capitals so it stands out: "daniel sykes" becomes "daniel SYKES". One-word names are left alone. */
export function surnameCaps(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return words.join(' ');
  words[words.length - 1] = words[words.length - 1].toUpperCase();
  return words.join(' ');
}

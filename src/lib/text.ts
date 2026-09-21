// Truncates on a word boundary near `maxLength` rather than mid-word.
export function excerpt(text: string, maxLength = 140): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

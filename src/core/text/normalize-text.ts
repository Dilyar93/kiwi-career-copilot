export function normalizeText(
  input: string,
  options: { stripMarks?: boolean } = {},
): string {
  const normalized =
    options.stripMarks ?? true
      ? input.normalize('NFKD').replace(/\p{M}/gu, '')
      : input.normalize('NFC');

  return normalized
    .toLocaleLowerCase('en-NZ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

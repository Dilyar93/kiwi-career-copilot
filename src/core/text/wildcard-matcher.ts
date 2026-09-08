import { normalizeText } from './normalize-text';

export function isValidPrefixWildcardPattern(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (
    !trimmed.endsWith('*') ||
    trimmed.length > 200 ||
    trimmed.indexOf('*') !== trimmed.length - 1
  ) {
    return false;
  }

  const prefix = normalizeText(trimmed.slice(0, -1));
  return prefix.length > 0 && !prefix.includes(' ');
}

export function matchesPrefixWildcard(
  normalizedText: string,
  pattern: string,
): boolean {
  if (!isValidPrefixWildcardPattern(pattern)) return false;
  const prefix = normalizeText(pattern.trim().slice(0, -1));
  return normalizedText.split(' ').some((token) => token.startsWith(prefix));
}

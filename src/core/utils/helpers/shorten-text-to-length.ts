const ENDING_FOR_TOO_LONG_STRING = '...';

export function shortenTextToLength(text: string, number: number): string {
  if (!text) return '';
  return text.length > number
    ? text.slice(0, number - ENDING_FOR_TOO_LONG_STRING.length) + ENDING_FOR_TOO_LONG_STRING
    : text;
}

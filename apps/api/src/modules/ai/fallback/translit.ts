const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
};
const VOWELS = new Set('аеёиоуэюяў');

/**
 * Uzbek Cyrillic → Latin (1995 alphabet, ʻ U+02BB / ʼ U+02BC) for names inserted into Uzbek Latin text:
 * replies in `uz` must not contain Cyrillic (post-check). "е" is "ye" at word start and after a vowel.
 */
export function uzCyrillicToLatin(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const lower = ch.toLowerCase();
    let lat: string | undefined;
    if (lower === 'е') {
      const prev = i > 0 ? text[i - 1]!.toLowerCase() : '';
      lat = prev === '' || !/\p{L}/u.test(prev) || VOWELS.has(prev) ? 'ye' : 'e';
    } else {
      lat = MAP[lower];
    }
    if (lat === undefined) {
      out += ch;
    } else if (ch !== lower && lat.length > 0) {
      const next = text[i + 1];
      const wordUpper = next !== undefined && next !== next.toLowerCase();
      out += wordUpper ? lat.toUpperCase() : lat[0]!.toUpperCase() + lat.slice(1);
    } else {
      out += lat;
    }
  }
  return out;
}

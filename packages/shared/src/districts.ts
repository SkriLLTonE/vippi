export const DISTRICT_CODES = [
  'BEKTEMIR',
  'CHILONZOR',
  'MIROBOD',
  'MIRZO_ULUGBEK',
  'OLMAZOR',
  'SERGELI',
  'SHAYXONTOHUR',
  'UCHTEPA',
  'YAKKASAROY',
  'YANGIHAYOT',
  'YASHNOBOD',
  'YUNUSOBOD',
] as const;
export type District = (typeof DISTRICT_CODES)[number];

export interface DistrictInfo {
  code: District;
  ru: string;
  uz: string;
  /** Lower-case spelling variants (apostrophes normalized to '). */
  aliases: string[];
}

export const DISTRICTS: readonly DistrictInfo[] = [
  { code: 'BEKTEMIR', ru: 'Бектемир', uz: 'Bektemir', aliases: ['бектемир', 'bektemir'] },
  {
    code: 'CHILONZOR',
    ru: 'Чиланзар',
    uz: 'Chilonzor',
    aliases: ['чиланзар', 'чилонзор', 'chilonzor', 'chilanzar', 'chilanzor'],
  },
  { code: 'MIROBOD', ru: 'Мирабад', uz: 'Mirobod', aliases: ['мирабад', 'миробод', 'mirobod', 'mirabad'] },
  {
    code: 'MIRZO_ULUGBEK',
    ru: 'Мирзо-Улугбек',
    uz: 'Mirzo Ulugʻbek',
    aliases: [
      'мирзо-улугбек',
      'мирзо улугбек',
      'мирзо-улугбекский',
      "mirzo ulug'bek",
      'mirzo ulugbek',
      "mirzo-ulug'bek",
      'mirzo-ulugbek',
    ],
  },
  { code: 'OLMAZOR', ru: 'Алмазар', uz: 'Olmazor', aliases: ['алмазар', 'олмазор', 'olmazor', 'almazar'] },
  { code: 'SERGELI', ru: 'Сергели', uz: 'Sergeli', aliases: ['сергели', 'sergeli'] },
  {
    code: 'SHAYXONTOHUR',
    ru: 'Шайхантахур',
    uz: 'Shayxontohur',
    aliases: ['шайхантахур', 'шайхантаур', 'shayxontohur', 'shaykhantakhur', 'shayhontohur'],
  },
  { code: 'UCHTEPA', ru: 'Учтепа', uz: 'Uchtepa', aliases: ['учтепа', 'uchtepa'] },
  { code: 'YAKKASAROY', ru: 'Яккасарай', uz: 'Yakkasaroy', aliases: ['яккасарай', 'yakkasaroy', 'yakkasaray'] },
  { code: 'YANGIHAYOT', ru: 'Янгихаёт', uz: 'Yangihayot', aliases: ['янгихаёт', 'янгихает', 'yangihayot'] },
  {
    code: 'YASHNOBOD',
    ru: 'Яшнабад',
    uz: 'Yashnobod',
    aliases: ['яшнабад', 'яшнобод', 'yashnobod', 'yashnabad'],
  },
  {
    code: 'YUNUSOBOD',
    ru: 'Юнусабад',
    uz: 'Yunusobod',
    aliases: ['юнусабад', 'юнусобод', 'yunusobod', 'yunusabad'],
  },
];

export function districtName(code: District, locale: 'ru' | 'uz'): string {
  const d = DISTRICTS.find((x) => x.code === code);
  return d ? d[locale] : code;
}

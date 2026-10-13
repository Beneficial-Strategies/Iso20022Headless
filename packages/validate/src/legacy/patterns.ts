// The pattern descriptions in the languages the library used to carry (es, fr, de, pt). NOT imported by anything: the library describes patterns in English
// only (patterns.ts), and the other languages are the text hosts' (the `format` of a type, in iso-20022-text). Kept as the source for those translations,
// like the translated catalogs; delete it with them.
import type { Words } from '../patterns.ts';

type Lang = 'en' | 'es' | 'fr' | 'de' | 'pt';
interface Known {
  name: Record<Lang, string>;
  example: string;
}

export const LEGACY_WORDS: Record<Lang, Words> = {
  en: {
    upper: ['uppercase letter', 'uppercase letters'],
    lower: ['lowercase letter', 'lowercase letters'],
    letters: ['letter', 'letters'],
    digit: ['digit', 'digits'],
    hex: ['lowercase hexadecimal digit', 'lowercase hexadecimal digits'],
    or: ' or ',
    alternative: '; or ',
    anyOf: 'any of',
    then: ', then ',
    optionally: 'optionally ',
    anyNumberOf: 'any number of ',
    to: ' to ',
    orMore: ' or more',
    character: 'the character',
  },
  es: {
    upper: ['letra mayúscula', 'letras mayúsculas'],
    lower: ['letra minúscula', 'letras minúsculas'],
    letters: ['letra', 'letras'],
    digit: ['dígito', 'dígitos'],
    hex: ['dígito hexadecimal en minúscula', 'dígitos hexadecimales en minúscula'],
    or: ' o ',
    alternative: '; o ',
    anyOf: 'cualquiera de',
    then: ', luego ',
    optionally: 'opcionalmente ',
    anyNumberOf: 'cualquier cantidad de ',
    to: ' a ',
    orMore: ' o más',
    character: 'el carácter',
  },
  fr: {
    upper: ['lettre majuscule', 'lettres majuscules'],
    lower: ['lettre minuscule', 'lettres minuscules'],
    letters: ['lettre', 'lettres'],
    digit: ['chiffre', 'chiffres'],
    hex: ['chiffre hexadécimal en minuscule', 'chiffres hexadécimaux en minuscules'],
    or: ' ou ',
    alternative: ' ; ou ',
    anyOf: "l'un des",
    then: ', puis ',
    optionally: 'éventuellement ',
    anyNumberOf: 'un nombre quelconque de ',
    to: ' à ',
    orMore: ' ou plus',
    character: 'le caractère',
  },
  de: {
    upper: ['Großbuchstabe', 'Großbuchstaben'],
    lower: ['Kleinbuchstabe', 'Kleinbuchstaben'],
    letters: ['Buchstabe', 'Buchstaben'],
    digit: ['Ziffer', 'Ziffern'],
    hex: ['hexadezimale Ziffer in Kleinbuchstaben', 'hexadezimale Ziffern in Kleinbuchstaben'],
    or: ' oder ',
    alternative: '; oder ',
    anyOf: 'beliebig aus',
    then: ', dann ',
    optionally: 'optional ',
    anyNumberOf: 'beliebig viele ',
    to: ' bis ',
    orMore: ' oder mehr',
    character: 'das Zeichen',
  },
  pt: {
    upper: ['letra maiúscula', 'letras maiúsculas'],
    lower: ['letra minúscula', 'letras minúsculas'],
    letters: ['letra', 'letras'],
    digit: ['dígito', 'dígitos'],
    hex: ['dígito hexadecimal minúsculo', 'dígitos hexadecimais minúsculos'],
    or: ' ou ',
    alternative: '; ou ',
    anyOf: 'qualquer um de',
    then: ', depois ',
    optionally: 'opcionalmente ',
    anyNumberOf: 'qualquer quantidade de ',
    to: ' a ',
    orMore: ' ou mais',
    character: 'o caractere',
  },
};

export const LEGACY_KNOWN: Record<string, Known> = {
  '[A-Z0-9]{4,4}[A-Z]{2,2}[A-Z0-9]{2,2}([A-Z0-9]{3,3}){0,1}': {
    name: { en: 'BIC (8 or 11 characters)', es: 'BIC (8 u 11 caracteres)', fr: 'BIC (8 ou 11 caractères)', de: 'BIC (8 oder 11 Zeichen)', pt: 'BIC (8 ou 11 caracteres)' },
    example: 'DEUTDEFF / DEUTDEFF500',
  },
  '[A-Z0-9]{18,18}[0-9]{2,2}': { name: { en: 'LEI (20 characters)', es: 'LEI (20 caracteres)', fr: 'LEI (20 caractères)', de: 'LEI (20 Zeichen)', pt: 'LEI (20 caracteres)' }, example: '529900T8BM49AURSDO55' },
  '[A-Z]{2,2}[0-9]{2,2}[a-zA-Z0-9]{1,30}': { name: { en: 'IBAN', es: 'IBAN', fr: 'IBAN', de: 'IBAN', pt: 'IBAN' }, example: 'DE89370400440532013000' },
  '[A-Z]{2,2}': { name: { en: 'country code (ISO 3166-1 alpha-2)', es: 'código de país (ISO 3166-1 alfa-2)', fr: 'code pays (ISO 3166-1 alpha-2)', de: 'Ländercode (ISO 3166-1 Alpha-2)', pt: 'código de país (ISO 3166-1 alfa-2)' }, example: 'DE' },
  '[A-Z]{3,3}': { name: { en: 'currency code (ISO 4217)', es: 'código de moneda (ISO 4217)', fr: 'code de devise (ISO 4217)', de: 'Währungscode (ISO 4217)', pt: 'código de moeda (ISO 4217)' }, example: 'EUR' },
};

export const LEGACY_LABELS: Record<Lang, { invalid: string; notValid: string; expected: string; example: string }> = {
  en: { invalid: 'Invalid format', notValid: 'Not a valid', expected: 'Expected', example: 'Example' },
  es: { invalid: 'Formato no válido', notValid: 'No es un', expected: 'Se espera', example: 'Ejemplo' },
  fr: { invalid: 'Format non valide', notValid: 'Non conforme au format', expected: 'Attendu', example: 'Exemple' },
  de: { invalid: 'Ungültiges Format', notValid: 'Kein gültiger Wert für', expected: 'Erwartet', example: 'Beispiel' },
  pt: { invalid: 'Formato inválido', notValid: 'Não é um valor válido de', expected: 'Esperado', example: 'Exemplo' },
};


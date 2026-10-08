/** `one` when n is 1, else `many`. Enough for the languages shipped so far. */
export const plural = (n: number | string | undefined, one: string, many: string): string => (Number(n) === 1 ? one : many);

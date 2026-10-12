/**
 * The format of the files a text host serves: the same as packages/validate/src/text-pack.ts, which is what the library reads. Repeated here
 * so that the language tools depend on no library code; a test (test/packFormat.test.ts) keeps the two the same.
 */
export type PackEntry = string | { text: string; status: 'reviewed' };
type Entries = Record<string, PackEntry>;

export interface LabelsPack {
  schema: 1;
  lang: string;
  labels: Record<string, PackEntry>;
}

export interface MessagePack {
  schema: 1;
  lang: string;
  message: string;
  types: Entries;
  members: Entries;
  codeSets: Entries;
  codes: Entries;
  codeNames: Entries;
  rules: Entries;
}

export const memberKey = (type: string, member: string): string => `${type}/${member}`;
export const codeKey = (codeSet: string, value: string): string => `${codeSet}/${value}`;
export const ruleKey = (type: string, rule: string): string => `${type}/${rule}`;

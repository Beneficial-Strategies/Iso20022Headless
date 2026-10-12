import { describe, expect, it } from 'vitest';
import { codeKey as coreCode, memberKey as coreMember, ruleKey as coreRule, type LabelsPack as CoreLabels, type MessagePack as CoreMessage } from '../../../packages/validate/src/text-pack.ts';
import { codeKey, memberKey, ruleKey, type LabelsPack, type MessagePack } from '../src/packFormat.ts';

// The language tools carry their own copy of the pack format (they must not import library code). This keeps it the same as the library's.
describe('the pack format of the tools is the library\'s', () => {
  it('builds the same keys', () => {
    expect([memberKey('A', 'b'), codeKey('C', 'X'), ruleKey('T', 'R')]).toEqual([coreMember('A', 'b'), coreCode('C', 'X'), coreRule('T', 'R')]);
  });

  it('has the same shape: each is assignable to the other', () => {
    const labels: LabelsPack = { schema: 1, lang: 'fr', labels: { A: 'a', B: { text: 'b', status: 'reviewed' } } };
    const message: MessagePack = { schema: 1, lang: 'fr', message: 'm', types: {}, members: { 'T/m': 'x' }, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
    const asCoreLabels: CoreLabels = labels;
    const asCoreMessage: CoreMessage = message;
    const back: LabelsPack = asCoreLabels;
    const backMessage: MessagePack = asCoreMessage;
    expect([back.lang, backMessage.message]).toEqual(['fr', 'm']);
  });
});

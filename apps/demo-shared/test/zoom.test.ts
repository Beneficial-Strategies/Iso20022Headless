import { describe, expect, it } from 'vitest';
import { enterZoom, leaveZoom, valueAt, withValueAt } from '../src/zoom.ts';

const outer = {
  GroupHeader: { MessageIdentification: 'MSG-1', InitiatingParty: { Name: 'Acme', PostalAddress: { AddressLine: ['1 Main St', 'Floor 2'] } } },
  PaymentInformation: [{ PaymentInformationIdentification: 'P1', Debtor: { Name: 'Dan' } }, { PaymentInformationIdentification: 'P2' }],
};

describe('paths', () => {
  it('reads values at dotted paths and list indexes', () => {
    expect(valueAt(outer, 'GroupHeader.InitiatingParty.Name')).toBe('Acme');
    expect(valueAt(outer, 'GroupHeader.InitiatingParty.PostalAddress.AddressLine[1]')).toBe('Floor 2');
    expect(valueAt(outer, 'PaymentInformation[0].Debtor')).toEqual({ Name: 'Dan' });
    expect(valueAt(outer, 'PaymentInformation[1].Debtor')).toBeUndefined();
    expect(valueAt(outer, 'Nothing.Here')).toBeUndefined();
    expect(valueAt(outer, '')).toBe(outer);
  });

  it('writes a copy and leaves the original alone', () => {
    const next = withValueAt(outer, 'PaymentInformation[1].Debtor', { Name: 'Eve' }) as typeof outer;
    expect((next.PaymentInformation[1] as { Debtor?: unknown }).Debtor).toEqual({ Name: 'Eve' });
    expect(next.PaymentInformation[0]).toBe(outer.PaymentInformation[0]); // untouched parts are shared
    expect((outer.PaymentInformation[1] as { Debtor?: unknown }).Debtor).toBeUndefined();
    expect(withValueAt({}, 'A.B[1].C', 'x')).toEqual({ A: { B: [undefined, { C: 'x' }] } });
  });
});

describe('zooming in', () => {
  it('starts from the values the element has in the outer message', () => {
    const { frame, start } = enterZoom('pain.001.001.13', 'CustomerCreditTransferInitiationV13', outer, 'PaymentInformation[0].Debtor');
    expect(start).toEqual({ Name: 'Dan' });
    expect(frame).toMatchObject({ outerType: 'CustomerCreditTransferInitiationV13', path: 'PaymentInformation[0].Debtor', had: true });
  });

  it('starts empty when the element has no value yet, as it always did', () => {
    const { frame, start } = enterZoom('m', 'T', outer, 'PaymentInformation[1].Debtor');
    expect(start).toBeUndefined();
    expect(frame.had).toBe(false);
  });
});

describe('zooming out', () => {
  const into = (path: string) => enterZoom('m', 'Outer', outer, path).frame;

  it('brings the outer message back with the zoomed edits in it', () => {
    const back = leaveZoom([into('GroupHeader.InitiatingParty')], 'Outer', { current: { Name: 'Acme Ltd' }, initial: {} });
    expect(valueAt(back!.values, 'GroupHeader.InitiatingParty')).toEqual({ Name: 'Acme Ltd' });
    expect(valueAt(back!.values, 'GroupHeader.MessageIdentification')).toBe('MSG-1'); // the rest is as it was
    expect(valueAt(back!.values, 'PaymentInformation[0].Debtor.Name')).toBe('Dan');
    expect(back!.stack).toEqual([]);
  });

  it('does not add an empty section when the element had none and nothing was typed', () => {
    const back = leaveZoom([into('PaymentInformation[1].Debtor')], 'Outer', { current: { Name: '' }, initial: { Name: '' } });
    expect(back!.values).toBe(outer);
  });

  it('adds the section when the element had none and something was typed', () => {
    const back = leaveZoom([into('PaymentInformation[1].Debtor')], 'Outer', { current: { Name: 'Eve' }, initial: { Name: '' } });
    expect(valueAt(back!.values, 'PaymentInformation[1].Debtor')).toEqual({ Name: 'Eve' });
  });

  it('keeps an element that had values even when it was not edited', () => {
    const back = leaveZoom([into('PaymentInformation[0].Debtor')], 'Outer', { current: { Name: 'Dan' }, initial: {} });
    expect(valueAt(back!.values, 'PaymentInformation[0].Debtor')).toEqual({ Name: 'Dan' });
  });

  it('a type that was not zoomed out of is an ordinary change: nothing comes back', () => {
    expect(leaveZoom([into('GroupHeader.InitiatingParty')], 'SomethingElse', { current: {}, initial: {} })).toBeUndefined();
    expect(leaveZoom([], 'Outer', undefined)).toBeUndefined();
  });

  it('zooming twice and coming back to the first outer type folds both levels in', () => {
    // level 1: message -> GroupHeader.InitiatingParty (type Party); level 2: Party -> PostalAddress (type Address)
    const f1 = enterZoom('m', 'Message', outer, 'GroupHeader.InitiatingParty');
    const party = f1.start;
    const f2 = enterZoom('m', 'Party', party, 'PostalAddress');
    const back = leaveZoom([f1.frame, f2.frame], 'Message', { current: { AddressLine: ['9 New Rd'] }, initial: {} });
    expect(valueAt(back!.values, 'GroupHeader.InitiatingParty.PostalAddress.AddressLine[0]')).toBe('9 New Rd');
    expect(valueAt(back!.values, 'GroupHeader.InitiatingParty.Name')).toBe('Acme');
    expect(back!.stack).toEqual([]);
  });

  it('coming back one level at a time keeps the other level on the stack', () => {
    const f1 = enterZoom('m', 'Message', outer, 'GroupHeader.InitiatingParty');
    const f2 = enterZoom('m', 'Party', f1.start, 'PostalAddress');
    const back = leaveZoom([f1.frame, f2.frame], 'Party', { current: { AddressLine: ['9 New Rd'] }, initial: {} });
    expect(valueAt(back!.values, 'PostalAddress.AddressLine[0]')).toBe('9 New Rd');
    expect(valueAt(back!.values, 'Name')).toBe('Acme');
    expect(back!.stack).toEqual([f1.frame]);
  });
});

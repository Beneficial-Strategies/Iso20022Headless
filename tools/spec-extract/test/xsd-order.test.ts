import { describe, expect, it } from 'vitest';
import { codeOrders, mergeOrders, orderFileText, parseOrderFile, typeOrders } from '../src/xsd-order.ts';

const xsd = (types: string): string => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="Document" type="Document"/>${types}</xs:schema>`;

const ASSIGN = `<xs:complexType name="CaseAssignment6"><xs:sequence>
  <xs:element name="Id" type="Max35Text"/>
  <xs:element name="Assgnr" type="Party50Choice"/>
  <xs:element maxOccurs="1" minOccurs="0" name="Note" type="Max35Text"/>
  <xs:element name="CreDtTm" type="ISODateTime"/>
</xs:sequence></xs:complexType>`;

describe('member order from an XSD', () => {
  it('reads elements in document order, including optional ones whose name comes after minOccurs', () => {
    expect(typeOrders(xsd(ASSIGN))).toEqual([{ type: 'CaseAssignment6', tags: ['Id', 'Assgnr', 'Note', 'CreDtTm'] }]);
  });

  it('skips the Document wrapper and types with no elements', () => {
    const doc = '<xs:complexType name="Document"><xs:sequence><xs:element name="Body" type="X"/></xs:sequence></xs:complexType>';
    const code = '<xs:simpleType name="Code"><xs:restriction base="xs:string"/></xs:simpleType>';
    expect(typeOrders(xsd(doc + code + ASSIGN)).map((t) => t.type)).toEqual(['CaseAssignment6']);
  });

  it('reads choices in the XSD order too', () => {
    const choice = '<xs:complexType name="Party50Choice"><xs:choice><xs:element name="Pty" type="A"/><xs:element name="Agt" type="B"/></xs:choice></xs:complexType>';
    expect(typeOrders(xsd(choice))[0]!.tags).toEqual(['Pty', 'Agt']);
  });

  it('merges several XSDs and reports a type that two of them order differently', () => {
    const ok = mergeOrders(new Map([['a.xsd', typeOrders(xsd(ASSIGN))], ['b.xsd', typeOrders(xsd(ASSIGN))]]));
    expect(ok.conflicts).toEqual([]);
    const other = ASSIGN.replace('"Id"', '"Zz"');
    expect(mergeOrders(new Map([['a.xsd', typeOrders(xsd(ASSIGN))], ['b.xsd', typeOrders(xsd(other))]])).conflicts).toEqual(['CaseAssignment6 is ordered differently in b.xsd']);
  });

  it('writes and reads the order file, one type per line, sorted', () => {
    const orders = new Map([['Zed1', ['B', 'A']], ['Alpha1', ['X', 'Y', 'Z']]]);
    const text = orderFileText(orders);
    expect(text).toBe('type\ttags\nAlpha1\tX,Y,Z\nZed1\tB,A\n');
    expect(parseOrderFile(text)).toEqual(new Map([['Alpha1', ['X', 'Y', 'Z']], ['Zed1', ['B', 'A']]]));
  });

  it('reads the values of a code set in enumeration order, skipping simple types that are not enumerations', () => {
    const codes = '<xs:simpleType name="PaymentMethod3Code"><xs:restriction base="xs:string"><xs:enumeration value="CHK"/><xs:enumeration value="TRF"/><xs:enumeration value="TRA"/></xs:restriction></xs:simpleType>';
    const text = '<xs:simpleType name="Max35Text"><xs:restriction base="xs:string"><xs:minLength value="1"/><xs:maxLength value="35"/></xs:restriction></xs:simpleType>';
    expect(codeOrders(xsd(codes + text))).toEqual([{ type: 'PaymentMethod3Code', tags: ['CHK', 'TRF', 'TRA'] }]);
  });
});

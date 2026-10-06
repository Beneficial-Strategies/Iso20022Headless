import { Iso20022Form, tailwindSkin } from '@beneficial-strategies/iso20022-react-ui';
import { schemas, typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';
import { serializeFragment, serializeFragmentIsoJson } from '@beneficial-strategies/iso20022-serialize';

const TYPE = 'BranchAndFinancialInstitutionIdentification8';

export function BranchAndFinancialInstitutionIdentification8Editor() {
  return (
    <Iso20022Form
      type="BranchAndFinancialInstitutionIdentification8"
      schemas={schemas}
      typeDescriptors={typeDescriptors}
      skin={tailwindSkin}
      // Called on every change. Save, send or transform the value here.
      onChange={(value, { valid }) => {
        if (valid) {
          const xml = serializeFragment(typeDescriptors, TYPE, value);
          const json = serializeFragmentIsoJson(typeDescriptors, TYPE, value);
          console.log(xml, json);
        }
      }}
    />
  );
}

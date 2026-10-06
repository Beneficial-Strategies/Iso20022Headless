import { Iso20022Form } from '@beneficial-strategies/iso20022-react-ui';
import { schemas, typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';

export function BranchAndFinancialInstitutionIdentification8Editor() {
  return (
    <Iso20022Form
      type="BranchAndFinancialInstitutionIdentification8"
      schemas={schemas}
      typeDescriptors={typeDescriptors}
      // Called on every change. Save, send or transform the value here.
      onChange={(value, { valid }) => {
        console.log(valid, value);
      }}
    />
  );
}

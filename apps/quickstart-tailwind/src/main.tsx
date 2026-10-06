import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BranchAndFinancialInstitutionIdentification8Editor } from './BranchAndFinancialInstitutionIdentification8Editor';
import './index.css';

// The app around the component is yours; this stands in for it.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="mx-auto max-w-xl p-4">
      <BranchAndFinancialInstitutionIdentification8Editor />
    </main>
  </StrictMode>,
);

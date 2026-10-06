import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BranchAndFinancialInstitutionIdentification8Editor } from './BranchAndFinancialInstitutionIdentification8Editor';

// The app around the component is yours; this stands in for it.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main style={{ maxWidth: '40rem', margin: '2rem auto', padding: '0 1rem' }}>
      <BranchAndFinancialInstitutionIdentification8Editor />
    </main>
  </StrictMode>,
);

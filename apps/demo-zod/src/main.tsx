import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoApp } from '@beneficial-strategies/iso20022-demo-shared';
import { useZodForm } from './useZodForm.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp
      title="ISO 20022 headless — Zod only (no form library)"
      blurb="Same UI, same generated Zod schema, but form state is ~80 lines of plain React in src/useZodForm.ts — no TanStack, no @beneficial-strategies/iso20022-react. Compare with the other demo to see what the hook buys you."
      useForm={useZodForm}
    />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoApp } from '@beneficial-strategies/iso20022-demo-shared';
import { useZodForm } from './useZodForm.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp variant="zod" useForm={useZodForm} />
  </StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoApp } from '@beneficial-strategies/iso20022-demo-shared';
import { useIso20022Form } from '@beneficial-strategies/iso20022-react';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp variant="form" useForm={useIso20022Form} />
  </StrictMode>,
);

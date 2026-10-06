import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoApp } from '@beneficial-strategies/iso20022-demo-shared';
import { useIso20022Form } from '@beneficial-strategies/iso20022-react';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp
      title="ISO 20022 headless — with our TanStack Form hook"
      blurb="State comes from @beneficial-strategies/iso20022-react (TanStack Form underneath). Validation is the generated Zod schema; the hook returns props to spread and renders nothing — every pixel here is the demo's own markup."
      useForm={useIso20022Form}
    />
  </StrictMode>,
);

import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as stories from './cert-manager.stories.tsx';

/* The cert-manager addon's stories draw, each: what Storybook shows is what they say. */

afterEach(cleanup);

const SAID: Record<string, string> = {
  Certificates: 'store-tls',
  Ready: 'Revision 2',
  Issuing: 'no such host',
  Failed: 'Next Attempt',
  Request: 'Not approved',
  AcmeIssuer: 'HTTP-01 · Ingress class nginx',
  CaIssuer: 'No Certificate manages Secret partner-ca',
  IngressTls: 'Not covered by TLS',
  Overview: 'api-tls',
};

describe('the cert-manager addon’s stories', () => {
  for (const [name, Story] of Object.entries(stories).filter(([n]) => n !== 'default')) {
    it(`${name} draws`, async () => {
      render(h(Story as FunctionComponent, null));
      expect(SAID[name], `${name}: what it says`).toBeDefined();
      await waitFor(() => expect(document.body.textContent).toContain(SAID[name]));
    });
  }
});

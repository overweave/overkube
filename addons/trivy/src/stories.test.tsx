import { cleanup, render, waitFor } from '@testing-library/preact';
import { type FunctionComponent, h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import * as stories from './trivy.stories.tsx';

/* The Trivy addon's stories draw, each: what Storybook shows is what they say. */

afterEach(cleanup);

const SAID: Record<string, string> = {
  Overview: 'Root file system is not read-only',
  Vulnerabilities: 'CVE-2021-3711',
  Scanning: 'Scanning',
  NotScanned: 'Not scanned',
  RbacAssessment: 'Manage secrets',
  Table: 'Critical',
  Images: 'library/busybox',
  Start: '1 scan Job',
  VulnerabilityReports: 'None found',
  VulnerabilityReportView: 'CVE-2021-3711',
  ExposedSecretReportView: 'AWS Access Key ID',
  SbomReportView: 'libssl1.1',
  InfraAssessmentReportView: 'anonymous-auth',
  ComplianceReportView: 'cluster-admin',
};

describe('the Trivy addon’s stories', () => {
  for (const [name, Story] of Object.entries(stories).filter(([n]) => n !== 'default')) {
    it(`${name} draws`, async () => {
      render(h(Story as FunctionComponent, null));
      expect(SAID[name], `${name}: what it says`).toBeDefined();
      await waitFor(() => expect(document.body.textContent).toContain(SAID[name]));
    });
  }
});

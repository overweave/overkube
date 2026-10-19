import certManager from '@overkube/addon-cert-manager';
import core from '@overkube/addon-core';
import flux from '@overkube/addon-flux';
import helm from '@overkube/addon-helm';
import metrics from '@overkube/addon-metrics';
import trivy from '@overkube/addon-trivy';
import type { Addon } from '@overkube/sdk';

/** The addons the page runs, in its bundle. */
export const addons: readonly Addon[] = [core, metrics, certManager, trivy, helm, flux];

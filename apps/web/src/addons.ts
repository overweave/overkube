import certManager from '@overkube/addon-cert-manager';
import core from '@overkube/addon-core';
import metrics from '@overkube/addon-metrics';
import type { Addon } from '@overkube/sdk';

/** The addons the page runs, in its bundle. */
export const addons: readonly Addon[] = [core, metrics, certManager];

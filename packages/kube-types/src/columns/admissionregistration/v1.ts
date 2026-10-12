/*
 * The admissionregistration.k8s.io group's v1 types (generated) and how
 * kubectl shows its kinds (by hand: printers.go, v1.37.1 —
 * printMutatingWebhook, printValidatingWebhook,
 * printValidatingAdmissionPolicy, printValidatingAdmissionPolicyBinding).
 */

import type {
  MutatingWebhookConfiguration,
  ValidatingAdmissionPolicy,
  ValidatingAdmissionPolicyBinding,
  ValidatingWebhookConfiguration,
} from '../../gen/admissionregistration/v1.js';
import { ageColumn, nameColumn, type PrinterColumn, selectorString } from '../print.js';

export * from '../../gen/admissionregistration/v1.js';

export const mutatingWebhookConfigurationColumns: PrinterColumn<MutatingWebhookConfiguration>[] = [
  nameColumn,
  { name: 'Webhooks', type: 'integer', value: (o) => o.webhooks?.length ?? 0, display: (o) => String(o.webhooks?.length ?? 0) },
  ageColumn,
];

export const validatingWebhookConfigurationColumns: PrinterColumn<ValidatingWebhookConfiguration>[] = [
  nameColumn,
  { name: 'Webhooks', type: 'integer', value: (o) => o.webhooks?.length ?? 0, display: (o) => String(o.webhooks?.length ?? 0) },
  ageColumn,
];

export const validatingAdmissionPolicyColumns: PrinterColumn<ValidatingAdmissionPolicy>[] = [
  nameColumn,
  {
    name: 'Validations',
    type: 'integer',
    value: (o) => o.spec?.validations?.length ?? 0,
    display: (o) => String(o.spec?.validations?.length ?? 0),
  },
  {
    name: 'ParamKind',
    type: 'string',
    value: (o) => (o.spec?.paramKind ? `${o.spec.paramKind.apiVersion}/${o.spec.paramKind.kind}` : undefined),
    display: (o) => (o.spec?.paramKind ? `${o.spec.paramKind.apiVersion}/${o.spec.paramKind.kind}` : '<unset>'),
  },
  ageColumn,
];

/**
 * A binding's params: named, its namespace (none: "*" — cluster-scoped or
 * not, it cannot tell) and name; else its selector (kubectl prints Go's own
 * dump of it: here, as a selector's string); none: undefined.
 */
function paramRef(o: ValidatingAdmissionPolicyBinding): string | undefined {
  const ref = o.spec?.paramRef;
  if (!ref) return undefined;
  if (ref.name) return `${ref.namespace || '*'}/${ref.name}`;
  return ref.selector ? (selectorString(ref.selector) ?? '') : undefined;
}

export const validatingAdmissionPolicyBindingColumns: PrinterColumn<ValidatingAdmissionPolicyBinding>[] = [
  nameColumn,
  { name: 'PolicyName', type: 'string', value: (o) => o.spec?.policyName, display: (o) => o.spec?.policyName ?? '' },
  { name: 'ParamRef', type: 'string', value: paramRef, display: (o) => paramRef(o) ?? '<unset>' },
  ageColumn,
];

/*
 * The batch group's v1 types (generated) and how kubectl shows its kinds (by
 * hand: printers.go, v1.37.1 — printJob, printCronJob).
 */

import type { CronJob, Job } from '../../gen/batch/v1.js';
import { ageColumn, boolPtr, containerCells, formatLabelSelector, humanDuration, known, nameColumn, type PrinterColumn, ratio, selectorString, since, time } from '../print.js';

export * from '../../gen/batch/v1.js';

/** Whether a job has a condition of this type that holds (the first of the type: hasJobCondition). */
const holds = (job: Job, type: string) => job.status?.conditions?.find((c) => c.type === type)?.status === 'True';

/** A job's state, as kubectl names it: the first of Complete, Failed, Terminating, Suspended, FailureTarget, SuccessCriteriaMet, else Running. */
function jobStatus(job: Job): string {
  if (holds(job, 'Complete')) return 'Complete';
  if (holds(job, 'Failed')) return 'Failed';
  if (job.metadata?.deletionTimestamp) return 'Terminating';
  if (holds(job, 'Suspended')) return 'Suspended';
  if (holds(job, 'FailureTarget')) return 'FailureTarget';
  if (holds(job, 'SuccessCriteriaMet')) return 'SuccessCriteriaMet';
  return 'Running';
}

/** How long a job has run: from its start to its end, or (still running) to now (live); not started: undefined. */
function duration(job: Job, now: number): number | undefined {
  const start = time(job.status?.startTime);
  if (start === undefined) return undefined;
  return (time(job.status?.completionTime) ?? now) - start;
}

export const jobColumns: PrinterColumn<Job>[] = [
  nameColumn,
  { name: 'Status', type: 'string', value: jobStatus, display: jobStatus },
  {
    name: 'Completions',
    type: 'string',
    value: (o) => ratio(o.status?.succeeded ?? 0, o.spec?.completions ?? 1),
    display: (o) => {
      const succeeded = o.status?.succeeded ?? 0;
      if (o.spec?.completions !== undefined) return `${succeeded}/${o.spec.completions}`;
      const parallelism = o.spec?.parallelism ?? 0;
      return parallelism > 1 ? `${succeeded}/1 of ${parallelism}` : `${succeeded}/1`;
    },
  },
  {
    name: 'Duration',
    type: 'string',
    value: (o, { now }) => duration(o, now),
    display: (o, { now }) => {
      const ms = duration(o, now);
      return ms === undefined ? '' : humanDuration(ms);
    },
  },
  ageColumn,
  {
    name: 'Containers',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).names),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).names,
  },
  {
    name: 'Images',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.template?.spec?.containers).images),
    display: (o) => containerCells(o.spec?.template?.spec?.containers).images,
  },
  { name: 'Selector', type: 'string', priority: 1, value: (o) => known(selectorString(o.spec?.selector)), display: (o) => formatLabelSelector(o.spec?.selector) },
];

export const cronJobColumns: PrinterColumn<CronJob>[] = [
  nameColumn,
  { name: 'Schedule', type: 'string', value: (o) => o.spec?.schedule, display: (o) => o.spec?.schedule ?? '' },
  { name: 'Timezone', type: 'string', value: (o) => o.spec?.timeZone, display: (o) => o.spec?.timeZone ?? '<none>' },
  { name: 'Suspend', type: 'boolean', value: (o) => o.spec?.suspend, display: (o) => boolPtr(o.spec?.suspend) },
  { name: 'Active', type: 'integer', value: (o) => o.status?.active?.length ?? 0, display: (o) => String(o.status?.active?.length ?? 0) },
  {
    name: 'Last Schedule',
    type: 'string',
    value: (o) => time(o.status?.lastScheduleTime),
    display: (o, context) => (o.status?.lastScheduleTime ? since(o.status.lastScheduleTime, context.now) : '<none>'),
  },
  ageColumn,
  {
    name: 'Containers',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.jobTemplate?.spec?.template?.spec?.containers).names),
    display: (o) => containerCells(o.spec?.jobTemplate?.spec?.template?.spec?.containers).names,
  },
  {
    name: 'Images',
    type: 'string',
    priority: 1,
    value: (o) => known(containerCells(o.spec?.jobTemplate?.spec?.template?.spec?.containers).images),
    display: (o) => containerCells(o.spec?.jobTemplate?.spec?.template?.spec?.containers).images,
  },
  {
    name: 'Selector',
    type: 'string',
    priority: 1,
    value: (o) => known(selectorString(o.spec?.jobTemplate?.spec?.selector)),
    display: (o) => formatLabelSelector(o.spec?.jobTemplate?.spec?.selector),
  },
];

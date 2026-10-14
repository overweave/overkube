import { define } from './define.ts';

/*
 * A Job's and a CronJob's, as kubectl shows them: how many of a Job's pods
 * succeeded of how many it needs (none said: 1); when a CronJob last ran.
 */
export const BATCH = define({
  'jobs.v1.batch.succeeded': { kinds: ['jobs.v1.batch'], type: 'number', value: { cel: 'self.?status.?succeeded.orValue(0)' } },
  'jobs.v1.batch.completions': { kinds: ['jobs.v1.batch'], type: 'number', value: { cel: 'self.?spec.?completions.orValue(1)' } },
  'cronjobs.v1.batch.lastSchedule': { kinds: ['cronjobs.v1.batch'], type: 'time', value: '.status.lastScheduleTime' },
});

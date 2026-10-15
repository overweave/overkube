import { define } from './define.ts';

/*
 * A Job's and a CronJob's, as kubectl shows them: how many of a Job's pods
 * succeeded of how many it needs (none said: 1), when it started and
 * finished; when a CronJob last ran, last ran well. An autoscaler's last
 * scaling.
 */
export const BATCH = define({
  'jobs.v1.batch.succeeded': { kinds: ['jobs.v1.batch'], type: 'number', value: { cel: 'self.?status.?succeeded.orValue(0)' } },
  'jobs.v1.batch.completions': { kinds: ['jobs.v1.batch'], type: 'number', value: { cel: 'self.?spec.?completions.orValue(1)' } },
  'jobs.v1.batch.started': { kinds: ['jobs.v1.batch'], type: 'time', value: '.status.startTime' },
  'jobs.v1.batch.finished': { kinds: ['jobs.v1.batch'], type: 'time', value: '.status.completionTime' },
  'cronjobs.v1.batch.lastSchedule': { kinds: ['cronjobs.v1.batch'], type: 'time', value: '.status.lastScheduleTime' },
  'cronjobs.v1.batch.lastSuccess': { kinds: ['cronjobs.v1.batch'], type: 'time', value: '.status.lastSuccessfulTime' },
  'horizontalpodautoscalers.v2.autoscaling.lastScale': { kinds: ['horizontalpodautoscalers.v2.autoscaling'], type: 'time', value: '.status.lastScaleTime' },
});

import { define } from './define.ts';

/*
 * An Event's, as kubectl shows it: when it was last seen — its series'
 * last observation, its last time, its first, or when it was made (an
 * event of events.k8s.io has its eventTime only).
 */
export const EVENTS = define({
  'events.v1.lastSeen': {
    kinds: ['events.v1'],
    type: 'time',
    value: {
      cel: "self.?series.?lastObservedTime.orValue(self.?lastTimestamp.orValue(self.?firstTimestamp.orValue(self.?eventTime.orValue(''))))",
    },
  },
});

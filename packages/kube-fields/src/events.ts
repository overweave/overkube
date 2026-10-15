import { define } from './define.ts';

/*
 * An Event's, as kubectl shows it: when it was last seen — its series'
 * last observation, its last time, its first, or when it was made (an
 * event of events.k8s.io has its eventTime only) and first; how often (its
 * series' count, its count — none said: once); what it is about (its
 * object's uid: the events of one object).
 */
export const EVENTS = define({
  'events.v1.about': { kinds: ['events.v1'], type: 'string', value: '.involvedObject.uid' },
  'events.v1.firstSeen': { kinds: ['events.v1'], type: 'time', value: { cel: "self.?firstTimestamp.orValue(self.?eventTime.orValue(''))" } },
  'events.v1.count': { kinds: ['events.v1'], type: 'number', value: { cel: 'self.?series.?count.orValue(self.?count.orValue(1))' } },
  'events.v1.lastSeen': {
    kinds: ['events.v1'],
    type: 'time',
    value: {
      cel: "self.?series.?lastObservedTime.orValue(self.?lastTimestamp.orValue(self.?firstTimestamp.orValue(self.?eventTime.orValue(''))))",
    },
  },
});

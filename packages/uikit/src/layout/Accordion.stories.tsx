import type { Meta } from '@storybook/preact-vite';
import { Button } from '../actions/Button';
import { KeyValue } from '../data/KeyValue';
import { Status } from '../status/Status';
import { Accordion, AccordionItem } from './Accordion';

const meta = { title: 'Layout/Accordion', component: Accordion } satisfies Meta<typeof Accordion>;
export default meta;

const details = (
  <KeyValue
    rows={[
      ['Image', 'registry.k8s.io/coredns/coredns:v1.12.0'],
      ['CPU', '100m'],
    ]}
  />
);

/** Lines, each a mark, a title and words quiet; one open. */
export const Marked = () => (
  <Accordion>
    <AccordionItem
      mark={<Status tone="done" icon="circle-check" />}
      title={
        <>
          <b>wait-for-api</b>
          <span>Completed · init</span>
        </>
      }
    >
      {details}
    </AccordionItem>
    <AccordionItem mark={<Status tone="ok" icon="circle-play" />} title={<b>coredns</b>} end="5 restarts">
      {details}
    </AccordionItem>
    <AccordionItem
      mark={<Status tone="error" icon="crash-loop" />}
      title={
        <>
          <b>metrics-proxy</b>
          <span>CrashLoopBackOff</span>
        </>
      }
      end={
        <>
          <span>41 restarts</span>
          <Button size="sm" variant="ghost" icon="file">
            Logs
          </Button>
        </>
      }
      open
    >
      {details}
    </AccordionItem>
  </Accordion>
);

/** Lines without marks: titles alone. */
export const Plain = () => (
  <Accordion>
    <AccordionItem title={<b>First</b>}>What is in the first.</AccordionItem>
    <AccordionItem title={<b>Second</b>}>What is in the second.</AccordionItem>
  </Accordion>
);

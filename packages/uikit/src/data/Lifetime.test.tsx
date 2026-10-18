import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Compare } from './Compare';
import { Lifetime, LifetimeCell } from './Lifetime';
import { Step, Steps } from './Steps';

/* The kit's ways of telling how long something holds and how it goes: their parts as said, their tones. */

afterEach(cleanup);

const width = (el: Element | null) => (el as HTMLElement | null)?.style.width;

describe('Lifetime', () => {
  it('draws before its renewal calm, after it a warning, now where it is; its times under it', () => {
    const { container } = render(
      <Lifetime
        from={0}
        renewal={60}
        till={100}
        now={25}
        marks={[
          { label: 'Not Before', date: 'a', when: 'x' },
          { label: 'Renewal', date: 'b', when: 'y', level: 'warn' },
          { label: 'Not After', date: 'c', when: 'z' },
        ]}
      />,
    );
    expect([...container.querySelectorAll('.uk-life-track > i')].map((i) => i.getAttribute('data-part'))).toEqual(['ok', 'warn']);
    expect(width(container.querySelector('.uk-life-track > i'))).toBe('60%');
    expect((container.querySelector('.uk-life-now') as HTMLElement).style.left).toBe('25%');
    expect(container.querySelector('small[data-level="warn"]')?.textContent).toBe('y');
  });

  it('draws one ended an error whole; one nothing renews as its level says', () => {
    const ended = render(<LifetimeCell from={0} till={10} now={20} said="ended" level="error" />).container;
    expect([...ended.querySelectorAll('.uk-life-track > i')].map((i) => i.getAttribute('data-part'))).toEqual(['error']);
    cleanup();
    const alone = render(<LifetimeCell from={0} till={10} now={5} said="5" level="warn" />).container;
    expect([...alone.querySelectorAll('.uk-life-track > i')].map((i) => i.getAttribute('data-part'))).toEqual(['warn']);
  });
});

describe('Steps, Compare', () => {
  it('say each step’s state; a row that differs', () => {
    const steps = render(
      <Steps>
        <Step state="done" title="a" />
        <Step state="stuck" title="b">
          why
        </Step>
      </Steps>,
    ).container;
    expect([...steps.querySelectorAll('.uk-step')].map((s) => s.getAttribute('data-state'))).toEqual(['done', 'stuck']);
    cleanup();
    const compare = render(
      <Compare
        heads={['Asked', 'Holds']}
        rows={[
          { label: 'Key', asked: 'a', holds: 'a' },
          { label: 'Names', asked: 'a', holds: 'b', differs: true },
        ]}
      />,
    ).container;
    expect([...compare.querySelectorAll('[data-differs]')].map((r) => r.textContent)).toEqual(['Namesab']);
  });
});

import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

/* A page's header: its title as the page's heading, an icon before it, a line beside it. */

afterEach(cleanup);

describe('PageHeader', () => {
  it('says its title as the page’s heading, with no space before it', () => {
    const { getByRole } = render(<PageHeader>Kubernetes</PageHeader>);
    const h1 = getByRole('heading', { level: 1, name: 'Kubernetes' });
    expect(h1.textContent).toBe('Kubernetes');
    expect(h1.querySelector('.uk-icon')).toBeNull();
  });

  it('draws its icon before its title, hidden from a reader', () => {
    const h1 = render(<PageHeader icon="kube">Kubernetes</PageHeader>).getByRole('heading', { level: 1 });
    const icon = h1.firstElementChild as Element;
    expect(icon.classList.contains('uk-icon')).toBe(true);
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(h1.textContent).toBe('Kubernetes');
  });

  it('says a line beside it, given one; none else', () => {
    const { container } = render(
      <PageHeader icon="kube" sub="v1.35.7 · single node">
        Kubernetes
      </PageHeader>,
    );
    expect(container.querySelector('.uk-page-header-sub')?.textContent).toBe('v1.35.7 · single node');
    cleanup();
    expect(render(<PageHeader>Kubernetes</PageHeader>).container.querySelector('.uk-page-header-sub')).toBeNull();
  });
});

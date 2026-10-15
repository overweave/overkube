import { boot } from './boot.ts';

/* The page: started into #app (boot.ts: what it is made of, in order). */

void boot({ element: document.getElementById('app') as HTMLElement, asked: new URLSearchParams(window.location.search) });

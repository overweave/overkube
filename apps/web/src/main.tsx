// The kit's fonts, the page's own files (its CSP takes no other site's).
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './page.css';
import { boot } from './boot.ts';

/* The page: started into #app (boot.ts: what it is made of, in order). */

void boot({ element: document.getElementById('app') as HTMLElement, asked: new URLSearchParams(window.location.search) });

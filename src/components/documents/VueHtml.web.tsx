import { createElement } from 'react';

/** Aperçu web : le document dans un cadre isolé (sans scripts). */
export function VueHtml({ html }: { html: string }) {
  return createElement('iframe', {
    title: 'Aperçu du document',
    srcDoc: html,
    sandbox: '',
    style: { flex: 1, width: '100%', height: '100%', border: 0, background: '#ffffff' },
  });
}

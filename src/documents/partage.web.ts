/**
 * Aperçu web : affiche le document en surimpression (les navigateurs bloquent l'ouverture d'un onglet
 * après un traitement asynchrone). Le bouton « Imprimer » permet d'en faire un PDF.
 */
/** Aperçu web : pas de fichier à joindre, on ouvre la discussion WhatsApp avec le message. */
export function applicationsWhatsApp(): string[] {
  return [];
}

export async function envoyerPdfWhatsApp(_html: string, _nomFichier: string, numero: string, message: string): Promise<'pdf' | 'texte'> {
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  return 'texte';
}

export async function partagerPdf(html: string): Promise<void> {
  document.getElementById('onile-apercu-document')?.remove();
  const calque = document.createElement('div');
  calque.id = 'onile-apercu-document';
  calque.setAttribute('role', 'dialog');
  calque.setAttribute('aria-label', 'Aperçu du document');
  Object.assign(calque.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,.55)',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    gap: '8px',
  });
  const barre = document.createElement('div');
  Object.assign(barre.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
  const bouton = (libelle: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = libelle;
    Object.assign(b.style, { padding: '8px 14px', borderRadius: '10px', border: '0', fontWeight: '600', cursor: 'pointer', background: '#fff', color: '#1F2937' });
    b.onclick = action;
    return b;
  };
  const cadre = document.createElement('iframe');
  cadre.title = 'Document';
  cadre.srcdoc = html;
  Object.assign(cadre.style, { flex: '1', border: '0', borderRadius: '12px', background: '#fff' });
  barre.append(
    bouton('Imprimer / PDF', () => cadre.contentWindow?.print()),
    bouton('Fermer', () => calque.remove())
  );
  calque.append(barre, cadre);
  document.body.appendChild(calque);
}

/** Aperçu web : téléchargement direct du fichier. */
export async function partagerFichierTexte(contenu: string, nomFichier: string, mimeType: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([`\uFEFF${contenu}`], { type: mimeType }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

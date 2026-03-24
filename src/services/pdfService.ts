/**
 * Génération de factures PDF via Expo Print (HTML to PDF)
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Proprietaire, Locataire, Facture, Logement } from '../types';
import { getLogement } from './logementService';

export async function genererFacturePDF(
  facture: Facture,
  proprietaire: Proprietaire,
  locataire: Locataire,
  details: { libelle: string; montant: number }[]
): Promise<{ uri: string }> {
  const logement = locataire.logement_id ? await getLogement(locataire.logement_id) : null;
  const dateStr = new Date(facture.created_at).toLocaleDateString('fr-FR');

  const rowsHtml = details.map(d => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${d.libelle}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${d.montant.toLocaleString('fr-FR')} FCFA</td>
    </tr>
  `).join('');

  const html = `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #333; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .owner-info { font-size: 14px; }
          .invoice-info { text-align: right; }
          .client-info { margin-bottom: 40px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
          th { background-color: #1e3a8a; color: white; padding: 12px; text-align: left; }
          .total { font-weight: bold; font-size: 18px; text-align: right; }
          .footer { margin-top: 60px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="owner-info">
            <h1 style="margin: 0;">${proprietaire.nom}</h1>
            <p>Tél: ${proprietaire.telephone}</p>
            <p>Adresse: ${proprietaire.adresse}</p>
          </div>
          <div class="invoice-info">
            <h2 style="color: #1e3a8a;">FACTURE</h2>
            <p>N° ${facture.numero_unique}</p>
            <p>Date: ${dateStr}</p>
          </div>
        </div>

        <div class="client-info">
          <p><strong>Client:</strong> ${locataire.nom_complet}</p>
          <p><strong>Tél:</strong> ${locataire.telephone}</p>
          ${logement ? `<p><strong>Logement:</strong> ${logement.numero}</p>` : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th>Désignation</th>
              <th style="text-align: right;">Montant</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <p class="total">TOTAL: ${facture.montant_total.toLocaleString('fr-FR')} FCFA</p>

        <div class="footer">
          <p>Merci pour votre confiance.</p>
          <p>Paiement à effectuer avant la date d'échéance.</p>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return { uri };
}

export async function partagerFacture(uri: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}

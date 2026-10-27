/**
 * Contenu de la visite guidée, écran par écran. Ajouter une étape (avec `nouveau: true`) suffit à la
 * présenter après une mise à jour : les étapes déjà vues ne reviennent pas.
 */
import type { EtapeVisite } from './Visite';

const v = <T extends Record<string, EtapeVisite[]>>(x: T) => x;

export const VISITES = v({
  accueil: [
    {
      cible: 'accueil.loyers',
      titre: 'Bienvenue dans Onílé',
      texte: 'Voici les loyers du mois : ce qui est encaissé et ce qui reste à percevoir. Touchez la carte pour voir le détail par locataire.',
    },
    {
      cible: 'accueil.maison',
      titre: 'Votre maison',
      texte: 'Touchez ici pour passer d’une maison à l’autre ou en ajouter une. Chaque maison a ses propres logements, locataires et finances.',
    },
    {
      cible: 'accueil.notifications',
      titre: 'Ce qui demande votre attention',
      texte: 'Loyers en retard, électricité bientôt épuisée, fin de contrat… Le chiffre rouge indique ce qui est à traiter.',
    },
    {
      cible: 'accueil.parametres',
      titre: 'Paramètres',
      texte: 'Votre signature, le modèle de contrat, la sauvegarde, la synchronisation et les mises à jour de l’application.',
    },
    {
      cible: 'accueil.actions',
      titre: 'Actions rapides',
      texte: 'Les gestes du quotidien en un toucher : encaisser un loyer, noter une dépense, vendre de l’électricité, ajouter un locataire.',
    },
    { fixe: true, cible: 'onglet.Properties', titre: 'Logements', texte: 'Vos chambres et appartements. Touchez une chambre pour voir son locataire, ce qu’il a payé et son électricité.' },
    { fixe: true, cible: 'onglet.Tenants', titre: 'Locataires', texte: 'Les fiches de vos locataires : contrat, échéancier, paiements, départ.' },
    { fixe: true, cible: 'onglet.Invoices', titre: 'Loyers', texte: 'Mois par mois : qui a payé, qui est en retard. Encaissez un paiement et envoyez la facture ou le reçu.' },
    { fixe: true, cible: 'onglet.Finances', titre: 'Finances', texte: 'Toutes les entrées et dépenses, et l’argent disponible.' },
  ],
  logements: [
    {
      cible: 'logements.outils',
      titre: 'Notifications et paramètres partout',
      texte: 'Ces deux boutons sont maintenant en haut de chaque onglet : plus besoin de revenir à l’accueil.',
      nouveau: true,
    },
    { cible: 'logements.ajouter', titre: 'Ajouter un logement', texte: 'Créez ici chaque chambre ou appartement de la maison, avec son loyer.' },
    { cible: 'logements.filtres', titre: 'Occupés ou libres', texte: 'Affichez seulement les logements occupés, ou ceux qui sont libres.' },
    {
      cible: 'logements.carte',
      titre: 'Une chambre',
      texte: 'Touchez-la : vous voyez son locataire, ce qu’il reste à payer, et vous pouvez encaisser un paiement ou gérer son électricité.',
      nouveau: true,
    },
    { cible: 'logements.fiche', titre: 'Fiche du locataire', texte: 'Ce bandeau ouvre directement la fiche complète du locataire de la chambre.', nouveau: true },
  ],
  chambre: [
    { cible: 'chambre.locataire', titre: 'Le locataire de la chambre', texte: 'Reste à payer, mois payés, prochain paiement. Touchez la carte pour ouvrir sa fiche.', nouveau: true },
    { cible: 'chambre.contact', titre: 'Appeler ou écrire', texte: 'Appelez le locataire ou ouvrez sa discussion WhatsApp, même si son numéro n’est pas dans vos contacts.', nouveau: true },
    { cible: 'chambre.encaisser', titre: 'Encaisser un paiement', texte: 'Enregistrez ce que le locataire vient de payer : le reçu est prêt à être envoyé.', nouveau: true },
    { cible: 'chambre.electricite', titre: 'Électricité de la chambre', texte: 'Ventes de kWh, relevés du compteur et avis au locataire.', nouveau: true },
  ],
  locataires: [
    { cible: 'locataires.ajouter', titre: 'Nouveau locataire', texte: 'Enregistrez l’entrée d’un locataire : sa fiche, son logement, son loyer et ses cautions.' },
    { cible: 'locataires.recherche', titre: 'Rechercher', texte: 'Retrouvez un locataire par son nom ou par son logement.' },
    { cible: 'locataires.carte', titre: 'Fiche du locataire', texte: 'Touchez un locataire pour voir sa situation, son échéancier, son contrat et ses paiements.' },
  ],
  fiche: [
    { cible: 'fiche.contact', titre: 'Appeler ou écrire sur WhatsApp', texte: 'Le numéro enregistré ouvre directement sa discussion WhatsApp.', nouveau: true },
    { cible: 'fiche.encaisser', titre: 'Encaisser un paiement', texte: 'Loyer, avance ou autres frais : le paiement est réparti sur les mois dus et un reçu est créé.' },
    { cible: 'fiche.bail', titre: 'Contrat de bail', texte: 'Lisez, faites signer et partagez le contrat, avec l’état des lieux.' },
    { cible: 'fiche.electricite', titre: 'Électricité', texte: 'Stock de kWh, ventes, relevés et avis au locataire.' },
  ],
  loyers: [
    { cible: 'loyers.mois', titre: 'Changer de mois', texte: 'Passez d’un mois à l’autre. Un mois à venir montre déjà les loyers payés d’avance.' },
    { cible: 'loyers.ligne', titre: 'Un loyer', texte: 'Touchez une ligne pour encaisser, voir la facture ou l’envoyer au locataire.' },
  ],
  finances: [
    { cible: 'finances.courbe', titre: 'Évolution', texte: 'Entrées et sorties d’argent, mois par mois.' },
    { cible: 'finances.filtres', titre: 'Filtrer les opérations', texte: 'Entrées, sorties ou opérations annulées.' },
  ],
  electricite: [
    { cible: 'electricite.carte', titre: 'Un compteur', texte: 'Stock de kWh et index de coupure. Touchez pour vendre des kWh, saisir un relevé ou avertir la personne.' },
    {
      cible: 'electricite.client',
      titre: 'Client électricité seule',
      texte: 'Vous vendez l’électricité à quelqu’un qui ne loue pas chez vous ? Ajoutez-le ici : pas de loyer, seulement l’électricité.',
      nouveau: true,
    },
  ],
  compteur: [
    { cible: 'compteur.vendre', titre: 'Vendre des kWh', texte: 'Saisissez le montant reçu : les kWh, le nouvel index de coupure et la facture sont calculés.' },
    { cible: 'compteur.releve', titre: 'Relevé du compteur', texte: 'Notez l’index affiché sur le compteur : la consommation est déduite du stock.' },
    {
      cible: 'compteur.avertir',
      titre: 'Avertir la personne',
      texte: 'Une fiche avec le dessin du compteur : quand le crédit se termine, ou combien payer et avant quelle date si le crédit est dépassé.',
      nouveau: true,
    },
  ],
  apercu: [
    {
      cible: 'apercu.message',
      titre: 'Un message déjà écrit',
      texte: 'Chaque document part avec un message adapté (loyer, électricité, contrat…). Modifiez-le si vous voulez avant d’envoyer.',
      nouveau: true,
    },
    {
      cible: 'apercu.whatsapp',
      titre: 'Envoyer sur WhatsApp',
      texte: 'Le document et un message déjà rédigé partent directement dans la discussion du locataire, même si son numéro n’est pas enregistré.',
      nouveau: true,
    },
    { cible: 'apercu.partager', titre: 'Partager autrement', texte: 'Envoyez le PDF par une autre application, ou enregistrez-le.' },
  ],
  parametres: [
    { cible: 'parametres.maisons', titre: 'Mes maisons', texte: 'Ajoutez ou renommez vos maisons. Chaque maison garde ses données séparées.' },
    { cible: 'parametres.documents', titre: 'Signature et contrat', texte: 'Votre signature est apposée sur les contrats, factures et reçus. Le modèle de contrat se modifie ici.' },
    { cible: 'parametres.gestion', titre: 'Sauvegarde et synchronisation', texte: 'Exportez une copie de vos données, ou synchronisez-les avec votre compte pour les retrouver sur un autre téléphone.' },
    {
      cible: 'parametres.aide',
      titre: 'Aide et avis',
      texte: 'Donnez votre avis ou proposez une idée : votre message nous arrive par e-mail. Vous pouvez aussi relancer cette visite guidée.',
      nouveau: true,
    },
  ],
});

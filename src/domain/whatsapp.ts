/**
 * WhatsApp : ouvrir la discussion avec un numéro, même s'il n'est pas enregistré dans les contacts,
 * avec un message déjà rédigé (lien officiel https://wa.me/<numéro>?text=…).
 */

/** Indicatif du Bénin, appliqué aux numéros saisis sans indicatif. */
export const INDICATIF_PAR_DEFAUT = '229';

/**
 * Numéro au format international sans « + » ni espaces (ex. 2290156784063), ou null s'il est inutilisable.
 * Au Bénin, les numéros ont 10 chiffres depuis 2024 (01 + les 8 anciens chiffres) :
 * un ancien numéro à 8 chiffres reçoit donc le préfixe 01.
 */
export function numeroWhatsApp(telephone: string | null | undefined, indicatif = INDICATIF_PAR_DEFAUT): string | null {
  if (!telephone) return null;
  const brut = telephone.trim();
  let chiffres = brut.replace(/\D/g, '');
  if (!chiffres) return null;
  if (brut.startsWith('+')) return chiffres.length >= 8 ? chiffres : null;
  if (chiffres.startsWith('00')) return chiffres.slice(2).length >= 8 ? chiffres.slice(2) : null;
  if (chiffres.startsWith(indicatif) && chiffres.length > 10) return chiffres;
  if (indicatif === '229' && chiffres.length === 8) chiffres = `01${chiffres}`;
  if (chiffres.length < 8) return null;
  return `${indicatif}${chiffres}`;
}

/** Lien qui ouvre WhatsApp sur la discussion avec ce numéro, message prérempli (ou null si numéro invalide). */
export function lienWhatsApp(telephone: string | null | undefined, message = ''): string | null {
  const numero = numeroWhatsApp(telephone);
  if (!numero) return null;
  return `https://wa.me/${numero}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

/** Salutation avec le nom complet (l'ordre nom / prénom varie : on ne le découpe pas). */
export function salutation(nom: string): string {
  const complet = nom.trim().replace(/\s+/g, ' ');
  return complet ? `Bonjour ${complet},` : 'Bonjour,';
}

/** « 2290162000002 » → « +229 01 62 00 00 02 » (autres pays : « +33612345678 »). */
export function numeroLisible(numero: string): string {
  if (numero.startsWith('229') && numero.length === 13) return `+229 ${numero.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
  return `+${numero}`;
}

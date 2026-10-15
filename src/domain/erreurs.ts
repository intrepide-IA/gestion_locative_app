/** Erreur métier : son message est destiné à l'utilisateur et peut être affiché tel quel. */
export class ErreurMetier extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurMetier';
  }
}

export function messageErreur(error: unknown, defaut = 'Une erreur est survenue.'): string {
  if (error instanceof ErreurMetier) return error.message;
  if (error instanceof Error && /UNIQUE constraint failed: logements\.reference/.test(error.message)) {
    return 'Un logement porte déjà cette référence.';
  }
  return defaut;
}

export function exigerMontant(valeur: number, libelle: string, { strictementPositif = false } = {}): number {
  if (!Number.isInteger(valeur) || valeur < 0 || (strictementPositif && valeur === 0)) {
    throw new ErreurMetier(`${libelle} : montant invalide.`);
  }
  return valeur;
}

export function exigerDate(valeur: string, libelle: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur) || Number.isNaN(Date.parse(valeur))) {
    throw new ErreurMetier(`${libelle} : date invalide.`);
  }
  return valeur;
}

export function texteOuNull(valeur: string | null | undefined): string | null {
  const v = valeur?.trim();
  return v ? v : null;
}

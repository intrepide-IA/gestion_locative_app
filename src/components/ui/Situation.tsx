import { View } from 'react-native';
import { Receipt, Zap } from 'lucide-react-native';

import { Text } from './Text';
import { formatFCFA } from '../../domain/format';
import type { NiveauSituation, SituationContrat } from '../../domain/rappels';
import { colors } from '../../theme/colors';

/** Vert : à jour ; ambre : échéance proche ou stock bas ; rouge : retard, crédit épuisé ou consommé sans payer. */
export const COULEURS_SITUATION: Record<NiveauSituation, { fond: string; texte: string }> = {
  ok: { fond: '#E7F4EC', texte: '#1E7A46' },
  attention: { fond: '#FFF4D6', texte: '#8A6500' },
  retard: { fond: '#FDECEA', texte: colors.danger },
};

function Pastille({ niveau, icone, libelle }: { niveau: NiveauSituation; icone: 'loyer' | 'electricite'; libelle: string }) {
  const c = COULEURS_SITUATION[niveau];
  const Icone = icone === 'loyer' ? Receipt : Zap;
  return (
    <View className="flex-row items-center rounded-full px-2 py-1" style={{ backgroundColor: c.fond }}>
      <Icone size={12} color={c.texte} />
      <Text className="text-xs font-semibold ml-1" style={{ color: c.texte }} numberOfLines={1}>
        {libelle}
      </Text>
    </View>
  );
}

const jours = (n: number) => (n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} j`);

/** Libellés courts du loyer et de l'électricité, avec leur niveau (pour les cartes et l'accessibilité). */
export function libellesSituation(s: SituationContrat): { loyer?: [NiveauSituation, string]; electricite?: [NiveauSituation, string] } {
  const r: ReturnType<typeof libellesSituation> = {};
  if (s.loyer) {
    const l = s.loyer;
    r.loyer =
      l.niveau === 'retard'
        ? ['retard', `Retard ${formatFCFA(l.enRetard)}`]
        : l.niveau === 'attention' && l.prochain
          ? ['attention', `Loyer ${jours(l.prochain.dans)}`]
          : ['ok', 'Loyer à jour'];
  }
  if (s.electricite) {
    const e = s.electricite;
    r.electricite =
      e.etat === 'deficit'
        ? ['retard', e.montantDu ? `Élec. dû ${formatFCFA(e.montantDu)}` : 'Élec. en déficit']
        : e.etat === 'epuise'
          ? ['retard', 'Élec. épuisée']
          : e.niveau === 'attention'
            ? ['attention', `Élec. ${String(Math.round(e.stock * 10) / 10).replace('.', ',')} kWh`]
            : ['ok', 'Élec. OK'];
  }
  return r;
}

/** Rangée de pastilles : situation du loyer et de l'électricité d'une chambre ou d'un locataire. */
export function PastillesSituation({ situation }: { situation: SituationContrat | undefined }) {
  if (!situation) return null;
  const { loyer, electricite } = libellesSituation(situation);
  if (!loyer && !electricite) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5 mt-2.5">
      {loyer ? <Pastille niveau={loyer[0]} icone="loyer" libelle={loyer[1]} /> : null}
      {electricite ? <Pastille niveau={electricite[0]} icone="electricite" libelle={electricite[1]} /> : null}
    </View>
  );
}

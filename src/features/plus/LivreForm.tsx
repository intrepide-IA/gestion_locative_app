import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { BookOpen, Check, FileSpreadsheet, FileText } from 'lucide-react-native';

import { Bouton } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import type { SqlDatabase } from '../../db/types';
import { exporterLivre } from '../../documents';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { periodesLivre, type PeriodeLivre } from '../../repositories/livreRepository';
import { colors } from '../../theme/colors';

const lirePeriodes = (db: SqlDatabase) => periodesLivre(db, aujourdhui());
const AUCUNE: PeriodeLivre[] = [];

/** Livre de tenue : choix de la période, puis PDF (document relié) ou Excel (tableaux à trier et filtrer). */
export function LivreForm() {
  const { donnees: periodes } = useRessource(lirePeriodes, AUCUNE);
  const [choix, setChoix] = useState(0);
  const [enCours, setEnCours] = useState<'pdf' | 'excel' | null>(null);
  const [erreur, setErreur] = useState('');

  const exporter = async (format: 'pdf' | 'excel') => {
    const periode = periodes[choix];
    if (!periode) return;
    setErreur('');
    setEnCours(format);
    try {
      await exporterLivre(periode, format);
    } catch (error) {
      setErreur(messageErreur(error, error instanceof Error ? error.message : 'Export impossible.'));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <>
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
          <BookOpen size={20} color={colors.primary} />
        </View>
        <Text className="flex-1 text-muted">
          Tout l’état de la maison dans un seul document : couverture, synthèse, situations irrégulières, chaque chambre avec ses
          locataires, ses loyers et ses paiements, l’électricité, les recettes et les dépenses.
        </Text>
      </View>

      <Text className="text-sm font-semibold text-ink mt-1">Période</Text>
      <View className="bg-white rounded-2xl border border-border overflow-hidden">
        {periodes.map((p, i) => (
          <Pressable
            key={p.libelle}
            onPress={() => setChoix(i)}
            accessibilityRole="radio"
            accessibilityState={{ checked: choix === i }}
            className={`flex-row items-center px-4 py-3 active:bg-background ${i < periodes.length - 1 ? 'border-b border-border' : ''}`}
          >
            <View className="flex-1">
              <Text className={`text-base ${choix === i ? 'text-primary font-semibold' : 'text-ink'}`}>{p.libelle}</Text>
              <Text className="text-xs text-muted">
                du {formatDate(p.debut)} au {formatDate(p.fin)}
              </Text>
            </View>
            {choix === i ? <Check size={18} color={colors.primary} /> : null}
          </Pressable>
        ))}
      </View>

      {erreur ? <Text className="text-danger">{erreur}</Text> : null}
      <Bouton
        titre="PDF : livre complet à lire ou imprimer"
        icone={<FileText size={18} color={colors.white} />}
        onPress={() => exporter('pdf')}
        chargement={enCours === 'pdf'}
        desactive={enCours !== null || !periodes.length}
      />
      <Bouton
        titre="Excel : tableaux à trier et filtrer"
        variante="secondaire"
        icone={<FileSpreadsheet size={18} color={colors.primary} />}
        onPress={() => exporter('excel')}
        chargement={enCours === 'excel'}
        desactive={enCours !== null || !periodes.length}
      />
      <Text className="text-xs text-muted text-center">Le fichier s’ouvre dans la fenêtre de partage : WhatsApp, e-mail, Drive…</Text>
    </>
  );
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Check, ChevronDown, Home, Pencil, Plus, Trash2 } from 'lucide-react-native';

import { confirmer, informer } from '../ui/confirmer';
import { Feuille } from '../ui/Feuille';
import { Bouton, Champ } from '../ui/kit';
import { Text } from '../ui/Text';
import { maisons as gestion } from '../../db/client';
import type { Maison } from '../../db/maisons';
import { pinService } from '../../security/native';
import { synchroniserNotifications } from '../../services/notifications';
import { colors } from '../../theme/colors';

interface ContexteMaisons {
  liste: Maison[];
  active: Maison | null;
  changer: (id: string) => Promise<void>;
  recharger: () => Promise<void>;
}

const Contexte = createContext<ContexteMaisons>({ liste: [], active: null, changer: async () => undefined, recharger: async () => undefined });

/**
 * Maison ouverte et liste des maisons. Changer de maison recrée tous les écrans (clé `active.id` dans
 * App) : chacun relit alors les données de la nouvelle maison.
 */
export function FournisseurMaisons({ children }: { children: (active: Maison | null) => ReactNode }) {
  const [liste, setListe] = useState<Maison[]>([]);
  const [active, setActive] = useState<Maison | null>(null);

  const recharger = useCallback(async () => {
    const [l, a] = await Promise.all([gestion.lister(), gestion.active()]);
    setListe(l);
    setActive(a);
  }, []);

  useEffect(() => {
    let actif = true;
    Promise.all([gestion.lister(), gestion.active()]).then(([l, a]) => {
      if (!actif) return;
      setListe(l);
      setActive(a);
    });
    return () => {
      actif = false;
    };
  }, []);

  const changer = useCallback(
    async (id: string) => {
      await gestion.changer(id);
      await recharger();
    },
    [recharger]
  );

  return <Contexte.Provider value={{ liste, active, changer, recharger }}>{children(active)}</Contexte.Provider>;
}

export const useMaisons = () => useContext(Contexte);

/** Bouton « Ma maison ▾ » qui ouvre la liste des maisons. */
export function BoutonMaison() {
  const { active, liste } = useMaisons();
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOuverte(true)}
        accessibilityRole="button"
        accessibilityLabel={`Maison : ${active?.nom ?? ''}. Changer de maison`}
        hitSlop={8}
        className="flex-row items-center self-start"
      >
        <Home size={13} color={colors.muted} />
        <Text className="text-muted text-sm ml-1" numberOfLines={1}>
          {active?.nom ?? 'Ma maison'}
          {liste.length > 1 ? ` · ${liste.length} maisons` : ''}
        </Text>
        <ChevronDown size={14} color={colors.muted} style={{ marginLeft: 2 }} />
      </Pressable>
      <Feuille ouverte={ouverte} onFermer={() => setOuverte(false)} titre="Mes maisons">
        <ListeMaisons onChange={() => setOuverte(false)} />
      </Feuille>
    </>
  );
}

/** Liste des maisons : ouvrir, renommer, ajouter, supprimer (code PIN). */
export function ListeMaisons({ onChange }: { onChange: () => void }) {
  const { liste, active, changer, recharger } = useMaisons();
  const [nouvelle, setNouvelle] = useState('');
  const [edition, setEdition] = useState<{ id: string; nom: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const action = async (f: () => Promise<void>, titreErreur: string) => {
    setEnCours(true);
    try {
      await f();
    } catch (error) {
      informer(titreErreur, error instanceof Error ? error.message : 'Erreur inconnue.');
    } finally {
      setEnCours(false);
    }
  };

  const ouvrir = (m: Maison) =>
    action(async () => {
      if (m.id === active?.id) return onChange();
      await changer(m.id);
      onChange();
    }, 'Changement impossible');

  const ajouter = () =>
    action(async () => {
      const m = await gestion.creer(nouvelle);
      setNouvelle('');
      await changer(m.id);
      informer('Maison ajoutée', `« ${m.nom} » est ouverte. Votre profil, votre signature et votre modèle de contrat y ont été repris.`);
      onChange();
    }, 'Ajout impossible');

  const supprimer = (m: Maison) =>
    action(async () => {
      const ok = await confirmer(
        `Supprimer « ${m.nom} » ?`,
        'Tous ses logements, locataires, loyers, factures et finances seront effacés de ce téléphone. Exportez d’abord une sauvegarde de cette maison si besoin.',
        'Continuer',
        true
      );
      if (!ok) return;
      const pin = await demanderPin();
      if (pin === null) return;
      const r = await pinService.verify(pin);
      if (r.status !== 'ok') throw new Error(r.status === 'locked' ? 'Trop d’essais : saisie bloquée.' : 'Code PIN incorrect.');
      await gestion.supprimer(m.id);
      await recharger();
      void synchroniserNotifications();
    }, 'Suppression impossible');

  const [demandePin, setDemandePin] = useState<((pin: string | null) => void) | null>(null);
  const demanderPin = () => new Promise<string | null>((resolve) => setDemandePin(() => resolve));

  return (
    <>
      <Text className="text-muted">Chaque maison a ses propres logements, locataires, loyers et finances. Touchez une maison pour l’ouvrir.</Text>
      <View className="bg-white rounded-2xl border border-border overflow-hidden">
        {liste.map((m, i) => (
          <View key={m.id} className={`flex-row items-center px-4 py-3 ${i < liste.length - 1 ? 'border-b border-border' : ''}`}>
            {edition?.id === m.id ? (
              <>
                <TextInput
                  value={edition.nom}
                  onChangeText={(nom) => setEdition({ id: m.id, nom })}
                  autoFocus
                  className="flex-1 bg-background rounded-xl px-3 py-2 text-ink"
                  style={{ fontFamily: 'Inter' }}
                />
                <Pressable
                  onPress={() =>
                    action(async () => {
                      await gestion.renommer(m.id, edition.nom);
                      setEdition(null);
                      await recharger();
                    }, 'Renommage impossible')
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Enregistrer le nom"
                  className="ml-2 w-10 h-10 rounded-full bg-primary items-center justify-center"
                >
                  <Check size={18} color={colors.white} />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={() => ouvrir(m)} accessibilityRole="button" className="flex-1 flex-row items-center py-1">
                  <View
                    className="w-6 h-6 rounded-full border-2 items-center justify-center mr-3"
                    style={{ borderColor: m.id === active?.id ? colors.primary : colors.border }}
                  >
                    {m.id === active?.id ? <View className="w-3 h-3 rounded-full bg-primary" /> : null}
                  </View>
                  <Text className={`text-base ${m.id === active?.id ? 'font-semibold text-ink' : 'text-ink'}`}>{m.nom}</Text>
                </Pressable>
                <Pressable onPress={() => setEdition({ id: m.id, nom: m.nom })} accessibilityRole="button" accessibilityLabel={`Renommer ${m.nom}`} className="p-2">
                  <Pencil size={16} color={colors.muted} />
                </Pressable>
                {liste.length > 1 && m.id !== active?.id ? (
                  <Pressable onPress={() => supprimer(m)} accessibilityRole="button" accessibilityLabel={`Supprimer ${m.nom}`} className="p-2">
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ))}
      </View>

      <View className="gap-2">
        <Champ libelle="Nouvelle maison" value={nouvelle} onChangeText={setNouvelle} placeholder="Ex. Maison de Calavi" />
        <Bouton titre="Ajouter cette maison" icone={<Plus size={18} color={colors.white} />} onPress={ajouter} chargement={enCours} desactive={!nouvelle.trim()} />
      </View>

      <Feuille
        ouverte={demandePin !== null}
        onFermer={() => {
          demandePin?.(null);
          setDemandePin(null);
        }}
        titre="Code PIN"
      >
        <SaisiePin
          onValider={(pin) => {
            demandePin?.(pin);
            setDemandePin(null);
          }}
        />
      </Feuille>
    </>
  );
}

function SaisiePin({ onValider }: { onValider: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  return (
    <>
      <Text className="text-muted">Confirmez la suppression avec votre code PIN.</Text>
      <Champ libelle="Code PIN" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} secureTextEntry keyboardType="number-pad" maxLength={6} />
      <Bouton titre="Supprimer la maison" variante="danger" onPress={() => onValider(pin)} desactive={pin.length < 4} />
    </>
  );
}

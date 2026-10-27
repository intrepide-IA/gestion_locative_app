import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { BellRing, Gauge, Power, Share2, Zap } from 'lucide-react-native';

import { ChampDate } from '../../components/ui/ChampDate';
import { BoutonsContact } from '../../components/ui/Contact';
import { confirmer, informer } from '../../components/ui/confirmer';
import { Feuille, useDefilerFeuille } from '../../components/ui/Feuille';
import { DemandeMotif } from '../../components/ui/DemandeMotif';
import { Badge, Bouton, Carte, Champ, Chargement, Choix, LigneInfo } from '../../components/ui/kit';
import { Cible, useVisiteSi } from '../../components/visite/Visite';
import { VISITES } from '../../components/visite/visites';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { preparerAvisElectricite, preparerFactureElectricite } from '../../documents';
import { useApercu } from '../../components/documents/Apercu';
import { ajouterJours, calculerAchat, LIBELLES_STOCK, type EtatStock } from '../../domain/electricite';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate, formatFCFA, lireMontant, formatHeure } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import {
  achatsDuContrat,
  acheterElectricite,
  annulerAchat,
  arreterClientElectricite,
  enregistrerReleve,
  relevesDuContrat,
  situationElectricite,
  type Achat,
  type Releve,
  type ResultatAchat,
  type SituationElectricite,
} from '../../repositories/electriciteRepository';
import { LIBELLES_MODE, type ModePaiement } from '../../repositories/loyerRepository';
import { colors } from '../../theme/colors';

export const formatKwh = (kwh: number) => `${String(kwh).replace('.', ',')} kWh`;

export function tonStock(etat: EtatStock): 'succes' | 'attention' | 'erreur' {
  return etat === 'ok' ? 'succes' : etat === 'bas' ? 'attention' : 'erreur';
}

type Vue = 'detail' | 'vente' | 'releve' | 'avis';

/** Fiche électricité d'un contrat : stock, vente de kWh, relevés et historiques. */
export function ElectriciteDetail({ contratId, onFermer, onModifie }: { contratId: number | null; onFermer: () => void; onModifie: () => void }) {
  const [vue, setVue] = useState<Vue>('detail');
  const fermer = () => {
    setVue('detail');
    onFermer();
  };
  const titres: Record<Vue, string> = { detail: 'Électricité', vente: 'Vendre des kWh', releve: 'Relevé du compteur', avis: 'Avertir le locataire' };
  return (
    <Feuille ouverte={contratId !== null} onFermer={fermer} titre={titres[vue]}>
      {contratId !== null ? (
        <Contenu
          contratId={contratId}
          vue={vue}
          setVue={setVue}
          onModifie={onModifie}
          onArrete={() => {
            onModifie();
            fermer();
          }}
        />
      ) : null}
    </Feuille>
  );
}

interface Donnees {
  situation: SituationElectricite | null;
  achats: Achat[];
  releves: Releve[];
}

function Contenu({
  contratId,
  vue,
  setVue,
  onModifie,
  onArrete,
}: {
  contratId: number;
  vue: Vue;
  setVue: (v: Vue) => void;
  onModifie: () => void;
  onArrete: () => void;
}) {
  const lire = useCallback(
    async (db: SqlDatabase): Promise<Donnees> => {
      const [situation, achats, releves] = await Promise.all([
        situationElectricite(db, contratId),
        achatsDuContrat(db, contratId),
        relevesDuContrat(db, contratId),
      ]);
      return { situation, achats, releves };
    },
    [contratId]
  );
  const { donnees, chargement, rafraichir } = useRessource(lire, { situation: null, achats: [], releves: [] });
  const { situation: s, achats, releves } = donnees;
  const ouvrirApercu = useApercu();
  const [aAnnuler, setAAnnuler] = useState<number | null>(null);
  useVisiteSi('compteur', VISITES.compteur, vue === 'detail' && s !== null, useDefilerFeuille());

  if (chargement && !s) return <Chargement />;
  if (!s) return <Text className="text-muted text-center py-8">Contrat introuvable.</Text>;

  const apres = () => {
    rafraichir();
    onModifie();
  };

  if (vue === 'vente') return <FormVente situation={s} onEnregistre={apres} onTerminer={() => setVue('detail')} />;
  if (vue === 'releve') return <FormReleve situation={s} onEnregistre={() => { apres(); setVue('avis'); }} />;
  if (vue === 'avis') return <FormAvis situation={s} onTerminer={() => setVue('detail')} />;

  const client = s.type_contrat === 'electricite';
  const arreter = async () => {
    const ok = await confirmer(
      'Arrêter le suivi de ce client ?',
      'Son compteur sera archivé et son historique conservé. L’électricité consommée sans crédit est retenue sur sa caution, le reste lui est rendu.',
      'Arrêter le suivi',
      true
    );
    if (!ok) return;
    try {
      const r = await arreterClientElectricite(await getDatabase(), s.contrat_id, aujourdhui());
      informer(
        'Suivi arrêté',
        [
          r.retenue ? `Retenu sur la caution : ${formatFCFA(r.retenue)}.` : '',
          r.rendue ? `À rendre au client : ${formatFCFA(r.rendue)}.` : '',
          r.resteDu ? `Le client doit encore ${formatFCFA(r.resteDu)}.` : '',
        ]
          .filter(Boolean)
          .join(' ') || 'Le compteur est archivé.'
      );
      onArrete();
    } catch (error) {
      informer('Impossible d’arrêter le suivi', messageErreur(error));
    }
  };

  return (
    <>
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-lg font-bold text-ink">{s.locataire_nom}</Text>
          <Text className="text-muted">
            {s.logement_reference} · {formatFCFA(s.prix_kwh)} / kWh
          </Text>
          {client ? <Text className="text-xs text-muted">Client électricité (sans location)</Text> : null}
        </View>
        <Badge libelle={LIBELLES_STOCK[s.etat]} ton={tonStock(s.etat)} />
      </View>
      <BoutonsContact telephone={s.locataire_telephone} />

      <View className={`rounded-3xl p-5 ${s.etat === 'ok' ? 'bg-primary' : s.etat === 'bas' ? 'bg-accent' : 'bg-danger'}`}>
        <Text className={s.etat === 'bas' ? 'text-ink' : 'text-white/80'}>{s.stock < 0 ? 'Déficit' : 'Stock restant'}</Text>
        <Text className={`text-4xl font-bold ${s.etat === 'bas' ? 'text-ink' : 'text-white'}`}>{formatKwh(Math.abs(s.stock))}</Text>
        <Text className={`mt-1 ${s.etat === 'bas' ? 'text-ink' : 'text-white/80'}`}>
          {formatKwh(s.achetes)} achetés · {formatKwh(s.consommes)} consommés
        </Text>
      </View>

      <Carte>
        <View className="flex-row items-center justify-between pb-2.5 border-b border-border">
          <View>
            <Text className="text-muted">Index de coupure</Text>
            <Text className="text-xs text-muted">Couper le compteur à cet index</Text>
          </View>
          <Text className="text-2xl font-bold text-danger">{indexTexte(s.index_coupure)}</Text>
        </View>
        <LigneInfo libelle="Dernier index relevé" valeur={indexTexte(s.dernier_index)} />
        <LigneInfo libelle="Relevé le" valeur={s.dernier_releve_le ? formatDate(s.dernier_releve_le) : 'Index initial du contrat'} />
        <LigneInfo
          libelle="Consommation moyenne"
          valeur={s.kwh_par_jour !== null ? `${String(s.kwh_par_jour).replace('.', ',')} kWh / jour` : 'Après un premier relevé'}
        />
        {s.epuisement_estime && s.stock > 0 ? (
          <LigneInfo libelle="Épuisement estimé" valeur={<Text className="font-bold text-ink">{formatDate(s.epuisement_estime)}</Text>} />
        ) : null}
        <Text className="text-muted text-xs pt-2">
          Un rappel vous est envoyé la veille et le jour de l’épuisement estimé pour aller vérifier le compteur.
        </Text>
      </Carte>

      <Cible id="compteur.vendre">
        <Bouton titre="Vendre des kWh" icone={<Zap size={18} color={colors.white} />} onPress={() => setVue('vente')} />
      </Cible>
      <Cible id="compteur.releve">
        <Bouton titre="Saisir un relevé" variante="secondaire" icone={<Gauge size={18} color={colors.primary} />} onPress={() => setVue('releve')} />
      </Cible>
      <Cible id="compteur.avertir">
        <Bouton
          titre={client ? 'Avertir le client' : 'Avertir le locataire'}
          variante="secondaire"
          icone={<BellRing size={18} color={colors.primary} />}
          onPress={() => setVue('avis')}
        />
      </Cible>

      {achats.length ? (
        <>
          <Text className="text-xs font-bold text-muted uppercase tracking-wider mt-2">Ventes</Text>
          {achats.map((a) => (
            <Carte key={a.id}>
              <View className="flex-row justify-between">
                <View className="flex-1">
                  <Text className={`font-semibold ${a.annule_le ? 'text-muted line-through' : 'text-ink'}`}>
                    {formatKwh(a.kwh)} · {formatFCFA(a.montant_facture)}
                  </Text>
                  <Text className="text-muted text-sm">
                    {formatDate(a.date_achat)} à {formatHeure(a.cree_le)} · {LIBELLES_MODE[a.mode]}
                    {a.facture_numero ? ` · ${a.facture_numero}` : ''}
                  </Text>
                  {a.index_achat !== null && a.index_coupure !== null ? (
                    <Text className="text-muted text-sm">
                      Index {indexTexte(a.index_achat)} → coupure à {indexTexte(a.index_coupure)}
                    </Text>
                  ) : null}
                  {a.annule_le ? <Text className="text-danger text-xs mt-1">Annulée : {a.motif_annulation}</Text> : null}
                </View>
                {a.annule_le ? <Badge libelle="Annulée" ton="neutre" /> : null}
              </View>
              <View className="flex-row gap-2 mt-3">
                <Bouton
                  titre="Facture"
                  variante="secondaire"
                  className="flex-1 py-2.5"
                  onPress={() => ouvrirApercu(() => preparerFactureElectricite(a.id))}
                />
                {!a.annule_le ? (
                  <Bouton
                    titre="Annuler"
                    variante="danger"
                    className="flex-1 py-2.5"
                    onPress={() => setAAnnuler(a.id)}
                  />
                ) : null}
              </View>
            </Carte>
          ))}
        </>
      ) : null}

      <DemandeMotif
        ouverte={aAnnuler !== null}
        titre="Annuler cette vente"
        explication="Les kWh seront retirés du stock, la facture marquée annulée et l’encaissement retiré de la trésorerie. La trace reste visible."
        libelleAction="Annuler la vente"
        onFermer={() => setAAnnuler(null)}
        onValider={async (motif) => {
          await annulerAchat(await getDatabase(), aAnnuler!, motif);
          setAAnnuler(null);
          apres();
        }}
      />

      {client ? (
        <Bouton titre="Arrêter le suivi de ce client" variante="danger" icone={<Power size={18} color={colors.danger} />} onPress={arreter} />
      ) : null}

      {releves.length ? (
        <Carte>
          <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Relevés</Text>
          {releves.map((r) => (
            <LigneInfo
              key={r.id}
              libelle={`${formatDate(r.date_releve)} · index ${String(r.nouvel_index).replace('.', ',')}`}
              valeur={r.motif_correction ? 'Nouveau compteur' : `+${formatKwh(Math.round(r.consommation * 10) / 10)}`}
            />
          ))}
        </Carte>
      ) : null}
    </>
  );
}

const indexTexte = (n: number) => String(n).replace('.', ',');

const MODES = (Object.keys(LIBELLES_MODE) as ModePaiement[]).map((m) => ({ valeur: m, libelle: LIBELLES_MODE[m] }));

function FormVente({ situation, onEnregistre, onTerminer }: { situation: SituationElectricite; onEnregistre: () => void; onTerminer: () => void }) {
  const [montant, setMontant] = useState('');
  const [indexActuel, setIndexActuel] = useState('');
  const [coupureFinale, setCoupureFinale] = useState<number | null>(null);
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [date, setDate] = useState(aujourdhui());
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatAchat | null>(null);
  const ouvrirApercu = useApercu();

  const m = lireMontant(montant);
  const apercu = m ? calculerAchat(m, situation.prix_kwh) : null;
  const index = indexActuel.trim() === '' ? null : Number(indexActuel.replace(',', '.'));
  const indexValide = index !== null && Number.isFinite(index) && index >= situation.dernier_index;
  // Le crédit restant s'ajoute au compteur tel qu'il est lu aujourd'hui.
  const stockApres = index !== null && indexValide ? situation.stock - (index - situation.dernier_index) : situation.stock;
  const coupureApres = apercu ? Math.round(((indexValide ? index! : situation.dernier_index) + stockApres + apercu.kwh) * 10) / 10 : null;

  const enregistrer = async () => {
    if (!m) return setErreur('Indiquez le montant reçu en FCFA.');
    if (index !== null && !indexValide)
      return setErreur(`L’index lu doit être au moins ${indexTexte(situation.dernier_index)}. Nouveau compteur : utilisez « Saisir un relevé ».`);
    setEnCours(true);
    setErreur('');
    try {
      if (index !== null && index > situation.dernier_index) {
        await enregistrerReleve(await getDatabase(), { contratId: situation.contrat_id, nouvelIndex: index, date });
      }
      setCoupureFinale(coupureApres);
      setResultat(await acheterElectricite(await getDatabase(), { contratId: situation.contrat_id, montantRecu: m, mode, date }));
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  if (resultat) {
    return (
      <>
        <View className="items-center py-2">
          <Zap size={48} color={colors.accent} />
          <Text className="text-xl font-bold text-ink mt-2">{formatKwh(resultat.kwh)} ajoutés</Text>
          <Text className="text-muted">Facture {resultat.factureNumero}</Text>
        </View>
        <Carte>
          <LigneInfo libelle="Montant facturé" valeur={formatFCFA(resultat.montantFacture)} />
          {resultat.ecart > 0 ? <LigneInfo libelle="À rendre au locataire" valeur={formatFCFA(resultat.ecart)} /> : null}
          {coupureFinale !== null ? (
            <LigneInfo libelle="Nouvel index de coupure" valeur={<Text className="font-bold text-danger">{indexTexte(coupureFinale)}</Text>} />
          ) : null}
        </Carte>
        <Bouton
          titre="Voir et partager la facture"
          variante="action"
          icone={<Share2 size={18} color={colors.ink} />}
          onPress={() => ouvrirApercu(() => preparerFactureElectricite(resultat.achatId))}
        />
        <Bouton titre="Terminer" variante="secondaire" onPress={onTerminer} />
      </>
    );
  }

  return (
    <>
      <Text className="text-muted">
        Prix du contrat : {formatFCFA(situation.prix_kwh)} / kWh. La quantité est arrondie à 0,1 kWh inférieur ; la différence est à
        rendre.
      </Text>
      <Champ libelle="Montant reçu (FCFA)" obligatoire value={montant} onChangeText={setMontant} keyboardType="number-pad" placeholder="2000" />
      <Champ
        libelle="Index lu sur le compteur maintenant"
        value={indexActuel}
        onChangeText={setIndexActuel}
        keyboardType="decimal-pad"
        placeholder={`Dernier : ${indexTexte(situation.dernier_index)}`}
        aide="Facultatif, mais conseillé : il enregistre un relevé et rend le calcul de coupure exact."
      />
      {apercu ? (
        <Carte>
          <LigneInfo libelle="kWh" valeur={formatKwh(apercu.kwh)} />
          {coupureApres !== null ? (
            <LigneInfo libelle="Couper à l’index" valeur={<Text className="font-bold text-danger">{indexTexte(coupureApres)}</Text>} />
          ) : null}
          <LigneInfo libelle="Montant facturé" valeur={formatFCFA(apercu.montantFacture)} />
          {apercu.ecart > 0 ? <LigneInfo libelle="À rendre" valeur={formatFCFA(apercu.ecart)} /> : null}
        </Carte>
      ) : null}
      <Choix libelle="Mode de paiement" options={MODES} valeur={mode} onChange={setMode} />
      <ChampDate libelle="Date" valeur={date} onChange={setDate} />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer la vente" onPress={enregistrer} chargement={enCours} />
    </>
  );
}

function FormReleve({ situation, onEnregistre }: { situation: SituationElectricite; onEnregistre: () => void }) {
  const [index, setIndex] = useState('');
  const [date, setDate] = useState(aujourdhui());
  const [nouveauCompteur, setNouveauCompteur] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const valeur = Number(index.replace(',', '.'));
  const valide = index.trim() !== '' && Number.isFinite(valeur) && valeur >= 0;
  const consommation = valide && valeur >= situation.dernier_index ? Math.round((valeur - situation.dernier_index) * 10) / 10 : null;
  const recule = valide && valeur < situation.dernier_index;

  const enregistrer = async () => {
    if (!valide) return setErreur('Indiquez l’index affiché sur le compteur.');
    setEnCours(true);
    setErreur('');
    try {
      await enregistrerReleve(await getDatabase(), {
        contratId: situation.contrat_id,
        nouvelIndex: valeur,
        date,
        motifCorrection: nouveauCompteur ? 'Changement de compteur' : null,
      });
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Text className="text-muted">Index précédent : {String(situation.dernier_index).replace('.', ',')}</Text>
      <Champ libelle="Nouvel index" obligatoire value={index} onChangeText={setIndex} keyboardType="decimal-pad" />
      {consommation !== null ? (
        <Carte>
          <LigneInfo libelle="Consommation" valeur={formatKwh(consommation)} />
          <LigneInfo libelle="Stock après relevé" valeur={formatKwh(Math.round((situation.stock - consommation) * 10) / 10)} />
        </Carte>
      ) : null}
      {recule ? (
        <Carte>
          <Text className="text-ink">L’index est inférieur au précédent.</Text>
          <Text className="text-muted text-sm mt-1">
            S’il s’agit d’un nouveau compteur, cochez ci-dessous : la consommation sera comptée à partir de ce nouvel index.
          </Text>
          <Choix
            libelle=""
            options={[
              { valeur: 'non', libelle: 'Erreur de saisie' },
              { valeur: 'oui', libelle: 'Nouveau compteur' },
            ]}
            valeur={nouveauCompteur ? 'oui' : 'non'}
            onChange={(v) => setNouveauCompteur(v === 'oui')}
          />
        </Carte>
      ) : null}
      <ChampDate libelle="Date du relevé" valeur={date} onChange={setDate} />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer le relevé" onPress={enregistrer} chargement={enCours} desactive={recule && !nouveauCompteur} />
    </>
  );
}

/**
 * Avis au locataire après un relevé : crédit restant et index de coupure, ou, s'il a dépassé,
 * la somme due et la date limite avant coupure. Fiche PDF (avec le dessin du compteur) et message WhatsApp.
 */
function FormAvis({ situation: s, onTerminer }: { situation: SituationElectricite; onTerminer: () => void }) {
  const [dateLimite, setDateLimite] = useState(ajouterJours(aujourdhui(), 3));
  const ouvrirApercu = useApercu();
  const depasse = s.stock < 0;
  const epuise = s.stock === 0;
  const montant = depasse ? Math.ceil(-s.stock * s.prix_kwh - 1e-9) : 0;
  return (
    <>
      <Text className="text-muted">
        Dernier relevé : index {indexTexte(s.dernier_index)}
        {s.dernier_releve_le ? ` le ${formatDate(s.dernier_releve_le)}` : ' (index initial)'}.
        {s.dernier_releve_le === aujourdhui() ? '' : ' Pour un avis exact, saisissez d’abord le relevé du jour.'}
      </Text>
      <Carte>
        <LigneInfo libelle="Index actuel" valeur={indexTexte(s.dernier_index)} />
        <LigneInfo libelle="Index de coupure" valeur={<Text className="font-bold text-danger">{indexTexte(s.index_coupure)}</Text>} />
        {depasse ? (
          <>
            <LigneInfo libelle="Consommé sans crédit" valeur={formatKwh(Math.abs(s.stock))} />
            <LigneInfo libelle="Montant à régler" valeur={<Text className="font-bold text-danger">{formatFCFA(montant)}</Text>} />
          </>
        ) : epuise ? (
          <LigneInfo libelle="Crédit" valeur="Épuisé" />
        ) : (
          <>
            <LigneInfo libelle="Crédit restant" valeur={formatKwh(s.stock)} />
            {s.epuisement_estime ? <LigneInfo libelle="Fin estimée" valeur={formatDate(s.epuisement_estime)} /> : null}
          </>
        )}
      </Carte>
      {depasse || epuise ? (
        <ChampDate
          libelle={depasse ? 'À régler avant le' : 'Recharger avant le'}
          valeur={dateLimite}
          onChange={setDateLimite}
          minimum={aujourdhui()}
        />
      ) : null}
      <Bouton
        titre="Voir l’avis et l’envoyer"
        icone={<Share2 size={18} color={colors.white} />}
        onPress={() => ouvrirApercu(() => preparerAvisElectricite(s.contrat_id, dateLimite))}
      />
      <Text className="text-muted text-xs text-center">
        L’avis contient un dessin du compteur. Vous pourrez l’envoyer sur WhatsApp avec un message déjà rédigé, ou le partager en PDF.
      </Text>
      <Bouton titre="Terminer" variante="secondaire" onPress={onTerminer} />
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { Text } from '../components/ui/Text';

import { AnimatedView, FadeInDown } from '../components/ui/AnimatedView';
import { Logo } from '../components/brand/Logo';
import { confirmer } from '../components/ui/confirmer';
import { PinPad, useShake } from '../components/ui/PinPad';
import {
  authentifierBiometrie,
  biometrieActivee,
  biometrieAProposer,
  definirBiometrie,
  marquerBiometrieProposee,
} from '../security/biometrie';
import { pinService } from '../security/native';
import { formatDelay } from '../security/format';
import { PIN_MAX_LENGTH } from '../security/pin';
import { colors } from '../theme/colors';
import { RecuperationScreen } from './RecuperationScreen';

interface PinScreenProps {
  onSuccess: () => void;
}

/**
 * Déverrouillage : empreinte ou visage (si activés), sinon code PIN haché.
 * Blocages croissants après 5 erreurs (5 min… 3 h) ; après 3 h, récupération des données proposée.
 */
export function PinScreen({ onSuccess }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [length, setLength] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [biometrie, setBiometrie] = useState(false);
  const [recuperationPossible, setRecuperationPossible] = useState(false);
  const [recuperation, setRecuperation] = useState(false);
  const { style: shakeStyle, shake } = useShake();
  const biometrieLancee = useRef(false);

  const deverrouillerParBiometrie = async () => {
    if (!(await authentifierBiometrie())) return;
    await pinService.resetAttempts();
    onSuccess();
  };

  useEffect(() => {
    Promise.all([pinService.pinLength(), pinService.currentLock(), biometrieActivee(), pinService.recoveryAvailable()]).then(
      ([len, lock, bio, recup]) => {
        setLength(len ?? PIN_MAX_LENGTH);
        setLockedUntil(lock);
        setBiometrie(bio);
        setRecuperationPossible(recup);
        // La fenêtre d'empreinte s'ouvre d'elle-même, une fois par affichage de l'écran.
        if (bio && !biometrieLancee.current) {
          biometrieLancee.current = true;
          void deverrouillerParBiometrie();
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compte à rebours pendant un blocage.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        setLockedUntil(null);
        setMessage('');
        pinService.recoveryAvailable().then(setRecuperationPossible);
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  /** Après le premier déverrouillage par code : proposer une seule fois l'empreinte. */
  const proposerBiometrie = async () => {
    if (!(await biometrieAProposer())) return;
    const ok = await confirmer(
      'Déverrouiller avec votre empreinte ?',
      'Onílé peut s’ouvrir avec l’empreinte ou le visage déjà enregistrés sur ce téléphone. Le code PIN reste toujours possible.',
      'Activer'
    );
    if (ok) await definirBiometrie(true);
    else await marquerBiometrieProposee();
  };

  const submit = async (value: string) => {
    setChecking(true);
    try {
      const result = await pinService.verify(value);
      if (result.status === 'ok') {
        await proposerBiometrie();
        onSuccess();
        return;
      }
      shake();
      setPin('');
      if (result.status === 'locked') {
        setLockedUntil(result.lockedUntil);
      } else if (result.status === 'wrong') {
        setLockedUntil(result.lockedUntil);
        setRecuperationPossible(false);
        setMessage(
          result.lockedUntil
            ? 'Trop d’erreurs.'
            : `Code incorrect. ${result.remainingBeforeLock} essai(s) avant blocage.`
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const onChange = (value: string) => {
    setPin(value);
    if (length && value.length === length) submit(value);
  };

  if (recuperation) return <RecuperationScreen onRetour={() => setRecuperation(false)} onDeverrouille={onSuccess} />;

  const locked = lockedUntil !== null && lockedUntil > now;

  return (
    <View className="flex-1 items-center justify-center bg-primary px-6">
      <AnimatedView entering={FadeInDown.duration(300)} className="items-center mb-12">
        <Logo variante="fond-vert" taille={84} />
        <Text className="text-white mt-6 text-base">{locked ? 'Saisie bloquée' : 'Entrez votre code PIN'}</Text>
        <Text className={`mt-2 text-sm text-center ${locked ? 'text-accent' : 'text-white/80'}`} accessibilityLiveRegion="polite">
          {locked ? `${message} Réessayez dans ${formatDelay(lockedUntil!, now)}.` : message}
        </Text>
        {locked && biometrie ? <Text className="mt-1 text-sm text-white/80">Votre empreinte reste utilisable.</Text> : null}
      </AnimatedView>

      {length ? (
        <PinPad
          value={pin}
          onChange={onChange}
          length={length}
          disabled={locked || checking}
          shakeStyle={shakeStyle}
          toucheSpeciale={
            biometrie
              ? { icone: <Fingerprint size={34} color={colors.accent} />, accessibilityLabel: 'Déverrouiller avec l’empreinte', onPress: deverrouillerParBiometrie }
              : undefined
          }
        />
      ) : null}

      {recuperationPossible && !locked ? (
        <Pressable onPress={() => setRecuperation(true)} accessibilityRole="button" hitSlop={10} className="mt-6 px-4 py-2">
          <Text className="text-accent font-semibold text-center">Code oublié ? Récupérer mes données</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

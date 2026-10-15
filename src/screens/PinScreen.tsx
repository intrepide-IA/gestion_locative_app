import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';

import { AnimatedView, FadeInDown } from '../components/ui/AnimatedView';
import { PinPad, useShake } from '../components/ui/PinPad';
import { pinService } from '../security/native';
import { formatDelay } from '../security/format';
import { PIN_MAX_LENGTH } from '../security/pin';
import { colors } from '../theme/colors';

interface PinScreenProps {
  onSuccess: () => void;
}

/** Déverrouillage : vérifie le PIN haché, applique et affiche le blocage après 5 erreurs. */
export function PinScreen({ onSuccess }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [length, setLength] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const { style: shakeStyle, shake } = useShake();

  useEffect(() => {
    Promise.all([pinService.pinLength(), pinService.currentLock()]).then(([len, lock]) => {
      setLength(len ?? PIN_MAX_LENGTH);
      setLockedUntil(lock);
    });
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
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const submit = async (value: string) => {
    setChecking(true);
    try {
      const result = await pinService.verify(value);
      if (result.status === 'ok') {
        onSuccess();
        return;
      }
      shake();
      setPin('');
      if (result.status === 'locked') {
        setLockedUntil(result.lockedUntil);
      } else if (result.status === 'wrong') {
        setLockedUntil(result.lockedUntil);
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

  const locked = lockedUntil !== null && lockedUntil > now;

  return (
    <View className="flex-1 items-center justify-center bg-primary px-6">
      <AnimatedView entering={FadeInDown.duration(300)} className="items-center mb-12">
        <View className="w-16 h-16 bg-white rounded-2xl items-center justify-center mb-4">
          <Lock size={30} color={colors.primary} />
        </View>
        <Text className="text-3xl font-bold text-white">Onílé</Text>
        <Text className="text-white/80 mt-1">Gérer aujourd’hui, habiter demain</Text>
        <Text className="text-white mt-6 text-base">{locked ? 'Saisie bloquée' : 'Entrez votre code PIN'}</Text>
        <Text className={`mt-2 text-sm ${locked ? 'text-accent' : 'text-white/80'}`} accessibilityLiveRegion="polite">
          {locked ? `${message} Réessayez dans ${formatDelay(lockedUntil!, now)}.` : message}
        </Text>
      </AnimatedView>

      {length ? (
        <PinPad value={pin} onChange={onChange} length={length} disabled={locked || checking} shakeStyle={shakeStyle} />
      ) : null}
    </View>
  );
}

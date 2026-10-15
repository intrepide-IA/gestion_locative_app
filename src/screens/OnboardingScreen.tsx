import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/ui/Text';

import { AnimatedView, FadeInDown } from '../components/ui/AnimatedView';
import { LogoSymbole } from '../components/brand/Logo';
import { PinPad, useShake } from '../components/ui/PinPad';
import { getDatabase } from '../db/client';
import { enregistrerProprietaire } from '../repositories/proprietaireRepository';
import { pinService } from '../security/native';
import { PIN_FORMAT_MESSAGES, PIN_MAX_LENGTH, PIN_MIN_LENGTH, validateNewPin } from '../security/pin';

type Step = 'profil' | 'pin' | 'confirmation';

interface OnboardingScreenProps {
  onDone: () => void;
}

/** Premier lancement : profil du propriétaire, puis création et confirmation du PIN (aucun code par défaut). */
export function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const [step, setStep] = useState<Step>('profil');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { style: shakeStyle, shake } = useShake();

  const choisirPin = () => {
    const formatError = validateNewPin(pin);
    if (formatError) {
      setError(PIN_FORMAT_MESSAGES[formatError]);
      shake();
      return;
    }
    setError('');
    setStep('confirmation');
  };

  const confirmer = async (value: string) => {
    if (value !== pin) {
      shake();
      setConfirmation('');
      setError('Les deux codes ne correspondent pas. Recommencez.');
      setPin('');
      setStep('pin');
      return;
    }
    setSaving(true);
    try {
      await enregistrerProprietaire(await getDatabase(), { nom, telephone, adresse });
      await pinService.createPin(pin);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
      setSaving(false);
    }
  };

  if (step === 'profil') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <AnimatedView entering={FadeInDown.duration(300)} className="items-center mb-8">
            <LogoSymbole taille={88} />
            <Text className="text-3xl font-bold text-primary">Bienvenue sur Onílé</Text>
            <Text className="text-muted mt-2 text-center">
              Commençons par votre profil. Il apparaîtra sur vos factures et reçus.
            </Text>
          </AnimatedView>

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-ink mb-1">Nom complet *</Text>
              <TextInput
                value={nom}
                onChangeText={setNom}
                placeholder="Ex. Moussa Adéyèmi"
                autoComplete="name"
                className="bg-white border border-border rounded-xl px-4 py-3 text-ink"
              />
            </View>
            <View>
              <Text className="text-sm font-medium text-ink mb-1">Téléphone</Text>
              <TextInput
                value={telephone}
                onChangeText={setTelephone}
                placeholder="+229 …"
                keyboardType="phone-pad"
                className="bg-white border border-border rounded-xl px-4 py-3 text-ink"
              />
            </View>
            <View>
              <Text className="text-sm font-medium text-ink mb-1">Adresse de la maison</Text>
              <TextInput
                value={adresse}
                onChangeText={setAdresse}
                placeholder="Quartier, ville"
                className="bg-white border border-border rounded-xl px-4 py-3 text-ink"
              />
            </View>
            {error ? <Text className="text-danger text-center">{error}</Text> : null}
            <TouchableOpacity
              disabled={!nom.trim()}
              onPress={() => {
                setError('');
                setStep('pin');
              }}
              className={`bg-primary py-4 rounded-xl mt-2 ${nom.trim() ? '' : 'opacity-50'}`}
            >
              <Text className="text-white text-center font-bold text-lg">Continuer</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const enConfirmation = step === 'confirmation';
  return (
    <View className="flex-1 items-center justify-center bg-primary px-6">
      <View className="items-center mb-10">
        <Text className="text-2xl font-bold text-white text-center">
          {enConfirmation ? 'Confirmez votre code' : 'Choisissez votre code PIN'}
        </Text>
        <Text className="text-white/80 mt-2 text-center">
          {enConfirmation
            ? 'Saisissez le même code une seconde fois.'
            : `${PIN_MIN_LENGTH} à ${PIN_MAX_LENGTH} chiffres. Il vous sera demandé à chaque ouverture.`}
        </Text>
        {error ? <Text className="text-accent mt-3 text-center">{error}</Text> : null}
      </View>

      {enConfirmation ? (
        <PinPad
          value={confirmation}
          onChange={(v) => {
            setConfirmation(v);
            if (v.length === pin.length) confirmer(v);
          }}
          length={pin.length}
          disabled={saving}
          shakeStyle={shakeStyle}
        />
      ) : (
        <PinPad
          value={pin}
          onChange={setPin}
          length={PIN_MAX_LENGTH}
          onSubmit={choisirPin}
          canSubmit={pin.length >= PIN_MIN_LENGTH}
          shakeStyle={shakeStyle}
        />
      )}

      <TouchableOpacity
        className="mt-6"
        onPress={() => {
          setError('');
          setPin('');
          setConfirmation('');
          setStep(enConfirmation ? 'pin' : 'profil');
        }}
      >
        <Text className="text-white/80 underline">Retour</Text>
      </TouchableOpacity>
    </View>
  );
}

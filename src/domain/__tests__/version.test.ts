import { texteMiseAJour, versionPlusRecente } from '../version';

test('compare les versions chiffre par chiffre', () => {
  expect(versionPlusRecente('1.0.11', '1.0.10')).toBe(true);
  expect(versionPlusRecente('1.0.10', '1.0.9')).toBe(true);
  expect(versionPlusRecente('1.0.9', '1.0.10')).toBe(false);
  expect(versionPlusRecente('1.0.11', '1.0.11')).toBe(false);
  expect(versionPlusRecente('2.0', '1.9.9')).toBe(true);
});

test('texte de la notification de mise à jour : corrections listées, puis invitation', () => {
  expect(texteMiseAJour('- Restauration corrigée\n- Empreinte digitale')).toBe(
    'Nouveautés : Restauration corrigée · Empreinte digitale\nTouchez pour mettre à jour.'
  );
  expect(texteMiseAJour(null)).toBe('Corrections et améliorations.\nTouchez pour mettre à jour.');
  expect(texteMiseAJour('x'.repeat(400)).split('\n')[0].length).toBeLessThan(300);
});

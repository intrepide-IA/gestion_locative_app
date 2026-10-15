import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

/** Affiche une image « data: » de signature (SVG dessiné dans l'app, ou PNG / JPEG importé). */
export function ApercuSignature({ image, hauteur = 90 }: { image: string; hauteur?: number }) {
  const svg = image.match(/^data:image\/svg\+xml;base64,(.+)$/);
  return (
    <View style={{ height: hauteur }} className="items-center justify-center">
      {svg ? (
        <SvgXml xml={atob(svg[1])} width="100%" height={hauteur} />
      ) : (
        <Image source={{ uri: image }} style={{ width: '100%', height: hauteur }} resizeMode="contain" accessibilityLabel="Signature" />
      )}
    </View>
  );
}

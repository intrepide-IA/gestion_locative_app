import { WebView } from 'react-native-webview';

/** Affiche un document HTML (aperçu avant partage). Les liens et scripts externes ne sont pas suivis. */
export function VueHtml({ html }: { html: string }) {
  // Largeur de page fixe : le téléphone affiche la page entière, comme le PDF.
  const page = html.replace('<head>', '<head><meta name="viewport" content="width=820">');
  return (
    <WebView
      source={{ html: page }}
      originWhitelist={['about:*', 'data:*']}
      javaScriptEnabled={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:') || r.url.startsWith('data:')}
      style={{ flex: 1, backgroundColor: '#ffffff' }}
      // Le document est mis en page pour A4 : on l'affiche en entier, zoom possible.
      scalesPageToFit
      setBuiltInZoomControls
      setDisplayZoomControls={false}
    />
  );
}

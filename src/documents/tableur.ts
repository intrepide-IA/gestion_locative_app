/**
 * Classeur Excel (.xlsx) écrit à la main : quelques fichiers XML zippés (fflate), sans grosse bibliothèque.
 * En-têtes en couleur, première ligne figée, filtres, montants et dates au format Excel (triables).
 */
import { strToU8, zipSync } from 'fflate';

export type TypeColonne = 'texte' | 'nombre' | 'montant' | 'date';

export interface Feuille {
  nom: string;
  /** Lignes de titre au-dessus du tableau (titre, période…). */
  entete?: string[];
  colonnes: { titre: string; type?: TypeColonne; largeur?: number }[];
  lignes: (string | number | null | undefined)[][];
  /** Ligne de total (en gras) sous le tableau. */
  total?: (string | number | null)[];
}

const xml = (v: string) =>
  v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A, B, … Z, AA, AB… */
export function lettreColonne(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Date AAAA-MM-JJ → numéro de série Excel. */
export function serieExcel(jour: string): number {
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, j) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

const nomFeuille = (n: string, deja: Set<string>) => {
  const base = n.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Feuille';
  let nom = base;
  for (let i = 2; deja.has(nom.toLowerCase()); i++) nom = `${base.slice(0, 28)} ${i}`;
  deja.add(nom.toLowerCase());
  return nom;
};

/* Styles : 0 normal, 1 en-tête, 2 montant, 3 date, 4 titre, 5 total texte, 6 total montant, 7 sous-titre. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0 &quot;F&quot;"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF0E6B4F"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0E6B4F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F6F4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><top style="thin"><color rgb="FF0E6B4F"/></top></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellule(ref: string, v: string | number | null | undefined, type: TypeColonne, style?: number): string {
  if (v === null || v === undefined || v === '') return style ? `<c r="${ref}" s="${style}"/>` : '';
  if (type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return `<c r="${ref}" s="${style ?? 3}"><v>${serieExcel(v)}</v></c>`;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = style ?? (type === 'montant' ? 2 : 0);
    return `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
}

function feuilleXml(f: Feuille): string {
  const lignes: string[] = [];
  let r = 1;
  (f.entete ?? []).forEach((t, i) => {
    lignes.push(`<row r="${r}">${cellule(`A${r}`, t, 'texte', i === 0 ? 4 : 7)}</row>`);
    r++;
  });
  if (f.entete?.length) r++;
  const ligneEntete = r;
  lignes.push(`<row r="${r}">${f.colonnes.map((c, i) => cellule(`${lettreColonne(i)}${r}`, c.titre, 'texte', 1)).join('')}</row>`);
  r++;
  for (const l of f.lignes) {
    lignes.push(`<row r="${r}">${f.colonnes.map((c, i) => cellule(`${lettreColonne(i)}${r}`, l[i], c.type ?? 'texte')).join('')}</row>`);
    r++;
  }
  if (f.total) {
    lignes.push(
      `<row r="${r}">${f.colonnes
        .map((c, i) => cellule(`${lettreColonne(i)}${r}`, f.total![i], c.type ?? 'texte', c.type === 'montant' || typeof f.total![i] === 'number' ? 6 : 5))
        .join('')}</row>`
    );
  }
  const derniere = lettreColonne(f.colonnes.length - 1);
  const cols = f.colonnes
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largeur ?? (c.type === 'montant' ? 14 : c.type === 'date' ? 12 : 18)}" customWidth="1"/>`)
    .join('');
  const fin = Math.max(ligneEntete, ligneEntete + f.lignes.length);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${ligneEntete}" topLeftCell="A${ligneEntete + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${lignes.join('')}</sheetData>
${f.lignes.length ? `<autoFilter ref="A${ligneEntete}:${derniere}${fin}"/>` : ''}
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

/** Fichier .xlsx complet (octets). */
export function classeurXlsx(feuilles: Feuille[], titre = 'Onílé'): Uint8Array {
  const deja = new Set<string>();
  const noms = feuilles.map((f) => nomFeuille(f.nom, deja));
  const fichiers: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${noms.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${xml(titre)}</dc:title><dc:creator>Onílé</dc:creator></cp:coreProperties>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${noms.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${noms.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${noms.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  feuilles.forEach((f, i) => (fichiers[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(feuilleXml(f))));
  return zipSync(fichiers, { level: 6 });
}

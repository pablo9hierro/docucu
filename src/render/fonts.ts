/**
 * Fontes empacotadas localmente. O canvas só desenha com uma fonte depois que
 * ela foi carregada, então preview e exportação aguardam `ensureFonts()`.
 */
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import '@fontsource/barlow/900.css';
import '@fontsource/anton/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/source-serif-4/600-italic.css';
import '@fontsource/source-serif-4/700.css';
import '@fontsource/source-serif-4/900.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';

const FACES = [
  '500 32px "Barlow Condensed"',
  '600 32px "Barlow Condensed"',
  '700 32px "Barlow Condensed"',
  '800 32px "Barlow Condensed"',
  '400 32px Barlow',
  '500 32px Barlow',
  '600 32px Barlow',
  '700 32px Barlow',
  '800 32px Barlow',
  '900 32px Barlow',
  '400 32px Anton',
  '600 32px "Source Serif 4"',
  'italic 600 32px "Source Serif 4"',
  '700 32px "Source Serif 4"',
  '900 32px "Source Serif 4"',
  '500 32px "IBM Plex Mono"',
  '600 32px "IBM Plex Mono"',
];

// Inclui acentos para forçar o download dos subconjuntos latin e latin-ext.
const SAMPLE = 'AaÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç0123456789@“”—•';

let ready: Promise<void> | null = null;

export function ensureFonts(): Promise<void> {
  if (!ready) {
    ready = Promise.all(FACES.map((f) => document.fonts.load(f, SAMPLE).catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => undefined);
  }
  return ready;
}

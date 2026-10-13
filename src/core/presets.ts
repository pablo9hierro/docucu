/**
 * Catálogo de manchetes. Cada preset tem estrutura própria (não só cor) e
 * uma animação de broadcast encenada, desenhada em src/render/headlines.ts.
 */
import type { Animation, TextFields, TextStyle } from './model';
import { PN } from './brand';

export type PresetCategory = 'manchete' | 'tarja' | 'selo' | 'texto';

export interface HeadlinePreset {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  /** tamanho padrão em frações do quadro */
  size: { w: number; h: number };
  /** posição padrão do centro, em frações do quadro */
  pos: { x: number; y: number };
  fields: TextFields;
  /** campos que o preset realmente usa (para o editor rápido) */
  uses: (keyof TextFields)[];
  style: TextStyle;
  animIn: Animation;
  animOut: Animation;
  /** duração padrão em segundos; null = até o fim do vídeo */
  defaultDuration: number | null;
}

const base: TextStyle = {
  primary: PN.navy,
  accent: PN.bright,
  text: PN.white,
  highlight: PN.yellow,
  fontScale: 1,
  align: 'center',
  uppercase: true,
};

const presetIn: Animation = { type: 'preset', duration: 0.9 };
const presetOut: Animation = { type: 'preset', duration: 0.5 };

export const HEADLINE_PRESETS: HeadlinePreset[] = [
  {
    id: 'pn-faixa',
    name: 'Faixa PN',
    category: 'manchete',
    description: 'Faixa inferior em degradê navy com fio azul, manchete centralizada e assinatura PN.',
    size: { w: 1, h: 0.27 },
    pos: { x: 0.5, y: 0.83 },
    fields: { kicker: '', title: 'Homem deixa celular cair no mar e câmera registra cenas inesperadas', subtitle: PN.handle },
    uses: ['title', 'subtitle'],
    style: { ...base },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-urgente',
    name: 'Urgente',
    category: 'manchete',
    description: 'Selo amarelo, caixa azul e destaque em amarelo para trechos entre *asteriscos*.',
    size: { w: 0.88, h: 0.15 },
    pos: { x: 0.5, y: 0.62 },
    fields: {
      kicker: 'Urgente',
      title: 'Advogado diz que motorista se apresentou à polícia e *negou cavalo de pau*',
      subtitle: '',
    },
    uses: ['kicker', 'title'],
    style: { ...base, primary: PN.deep, align: 'left' },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-tarja',
    name: 'Tarja lateral',
    category: 'manchete',
    description: 'Caixa navy alinhada à esquerda com fio vertical, estilo telejornal regional.',
    size: { w: 0.84, h: 0.12 },
    pos: { x: 0.52, y: 0.58 },
    fields: { kicker: '', title: 'Ataque a tiros deixa moradores em pânico na cidade de Santa Rita', subtitle: '' },
    uses: ['title'],
    style: { ...base, primary: PN.deep, align: 'left' },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-largo',
    name: 'Faixa larga',
    category: 'manchete',
    description: 'Faixa de ponta a ponta translúcida, manchete grande alinhada à esquerda.',
    size: { w: 1, h: 0.17 },
    pos: { x: 0.5, y: 0.5 },
    fields: { kicker: '', title: 'Vídeo viralizou: prefeitura anuncia mudanças no trânsito do centro', subtitle: '' },
    uses: ['title'],
    style: { ...base, primary: PN.deep, align: 'left' },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-serif',
    name: 'Editorial serifado',
    category: 'manchete',
    description: 'Serifa pesada centralizada sobre placa profunda, com barra segmentada.',
    size: { w: 1, h: 0.2 },
    pos: { x: 0.5, y: 0.7 },
    fields: { kicker: '', title: 'Operação prende suspeitos de fraude em licitações no interior do estado', subtitle: '' },
    uses: ['title'],
    style: { ...base, primary: PN.deep, accent: PN.sky },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-camera',
    name: 'Legenda de câmera',
    category: 'manchete',
    description: 'Caixa sólida com tipografia monoespaçada, para imagens de câmera de segurança.',
    size: { w: 0.88, h: 0.1 },
    pos: { x: 0.5, y: 0.6 },
    fields: { kicker: '', title: 'Momento do assalto registrado por câmera', subtitle: '' },
    uses: ['title'],
    style: { ...base, primary: PN.black },
    animIn: { type: 'preset', duration: 1.2 },
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-marcador',
    name: 'Marcador por linha',
    category: 'manchete',
    description: 'Cada linha ganha seu próprio bloco, entrando em cascata.',
    size: { w: 0.86, h: 0.16 },
    pos: { x: 0.5, y: 0.3 },
    fields: { kicker: '', title: 'Chuva forte alaga ruas e deixa bairros sem energia', subtitle: '' },
    uses: ['title'],
    style: { ...base, primary: PN.blue },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-chapeu',
    name: 'Lower third com chapéu',
    category: 'tarja',
    description: 'Chapéu em aba, título na placa e linha de apoio — clássico de TV.',
    size: { w: 0.8, h: 0.11 },
    pos: { x: 0.46, y: 0.8 },
    fields: { kicker: 'Segurança', title: 'Polícia investiga ataque em Santa Rita', subtitle: 'Imagens de câmera ajudam na identificação' },
    uses: ['kicker', 'title', 'subtitle'],
    style: { ...base, primary: PN.white, text: PN.navy, accent: PN.blue, align: 'left', uppercase: false },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: 6,
  },
  {
    id: 'pn-nome',
    name: 'Identificação (GC)',
    category: 'tarja',
    description: 'Nome e função do entrevistado.',
    size: { w: 0.62, h: 0.075 },
    pos: { x: 0.36, y: 0.76 },
    fields: { kicker: '', title: 'Maria da Silva', subtitle: 'Moradora do bairro' },
    uses: ['title', 'subtitle'],
    style: { ...base, primary: PN.deep, accent: PN.sky, align: 'left', uppercase: false },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: 5,
  },
  {
    id: 'pn-aovivo',
    name: 'Ao vivo',
    category: 'selo',
    description: 'Selo "ao vivo" com ponto pulsante e localização.',
    size: { w: 0.42, h: 0.04 },
    pos: { x: 0.26, y: 0.1 },
    fields: { kicker: 'Ao vivo', title: 'João Pessoa', subtitle: '' },
    uses: ['kicker', 'title'],
    style: { ...base, primary: PN.red, accent: PN.navy, align: 'left' },
    animIn: { type: 'preset', duration: 0.6 },
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-letreiro',
    name: 'Letreiro',
    category: 'tarja',
    description: 'Faixa de rodapé com texto correndo.',
    size: { w: 1, h: 0.045 },
    pos: { x: 0.5, y: 0.955 },
    fields: { kicker: 'Últimas', title: 'Acompanhe as principais notícias da Paraíba e do Brasil em primeirasnoticias.com.br', subtitle: '' },
    uses: ['kicker', 'title'],
    style: { ...base, primary: PN.navy, accent: PN.bright, align: 'left' },
    animIn: { type: 'preset', duration: 0.6 },
    animOut: presetOut,
    defaultDuration: null,
  },
  {
    id: 'pn-citacao',
    name: 'Citação',
    category: 'texto',
    description: 'Aspas grandes, fala em serifa e atribuição.',
    size: { w: 0.84, h: 0.2 },
    pos: { x: 0.5, y: 0.45 },
    fields: { kicker: '', title: 'Nós vamos apurar tudo e os responsáveis serão punidos', subtitle: 'Secretário de Segurança' },
    uses: ['title', 'subtitle'],
    style: { ...base, primary: PN.navy, accent: PN.sky, align: 'left', uppercase: false },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: 6,
  },
  {
    id: 'pn-numero',
    name: 'Número em destaque',
    category: 'texto',
    description: 'Dado numérico grande com legenda.',
    size: { w: 0.7, h: 0.16 },
    pos: { x: 0.5, y: 0.4 },
    fields: { kicker: '', title: '1.240', subtitle: 'famílias desalojadas pela chuva' },
    uses: ['title', 'subtitle'],
    style: { ...base, primary: PN.navy, accent: PN.yellow, align: 'center', uppercase: false },
    animIn: presetIn,
    animOut: presetOut,
    defaultDuration: 5,
  },
  {
    id: 'pn-perfil',
    name: '@perfil',
    category: 'selo',
    description: 'Assinatura com o perfil da página.',
    size: { w: 0.6, h: 0.035 },
    pos: { x: 0.5, y: 0.93 },
    fields: { kicker: '', title: PN.handle, subtitle: '' },
    uses: ['title'],
    style: { ...base, uppercase: false },
    animIn: { type: 'fade', duration: 0.4 },
    animOut: { type: 'fade', duration: 0.4 },
    defaultDuration: null,
  },
  {
    id: 'pn-credito',
    name: 'Crédito de imagem',
    category: 'selo',
    description: 'Crédito discreto em canto.',
    size: { w: 0.4, h: 0.022 },
    pos: { x: 0.74, y: 0.06 },
    fields: { kicker: 'Imagem', title: 'Redes sociais', subtitle: '' },
    uses: ['kicker', 'title'],
    style: { ...base, align: 'right', uppercase: true },
    animIn: { type: 'fade', duration: 0.3 },
    animOut: { type: 'fade', duration: 0.3 },
    defaultDuration: null,
  },
  {
    id: 'plain',
    name: 'Texto livre',
    category: 'texto',
    description: 'Texto com contorno e sombra, sem placa.',
    size: { w: 0.8, h: 0.08 },
    pos: { x: 0.5, y: 0.5 },
    fields: { kicker: '', title: 'Digite seu texto', subtitle: '' },
    uses: ['title'],
    style: { ...base, primary: PN.black, uppercase: false },
    animIn: { type: 'fade', duration: 0.3 },
    animOut: { type: 'fade', duration: 0.3 },
    defaultDuration: 4,
  },
];

export function getPreset(id: string): HeadlinePreset {
  return HEADLINE_PRESETS.find((p) => p.id === id) ?? HEADLINE_PRESETS[HEADLINE_PRESETS.length - 1]!;
}

# Primeiras Notícias Studio

Editor de vídeo jornalístico que roda **100% local** (navegador + servidor Node na própria máquina). Faz Reels e vídeos de feed com manchetes animadas, logos da marca, desfoque de regiões, timeline multitrilha e exportação MP4 via FFmpeg.

Nenhum arquivo é enviado para a internet. Mídia fica em `data/media`, projetos no SQLite em `data/studio.sqlite`.

## Requisitos

- **Node.js 22.13+** (usa o módulo nativo `node:sqlite`)
- **FFmpeg e FFprobe**
  - Windows: `winget install Gyan.FFmpeg`
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- Navegador baseado em Chromium (Chrome/Edge) recomendado

## Começar

```bash
npm run setup     # instala dependências, verifica FFmpeg e cria o banco
npm run dev       # sobe API (127.0.0.1:5174) + editor (http://localhost:5173) e abre o navegador
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run check` | verifica Node/FFmpeg/FFprobe |
| `npm test` | testes unitários (Vitest) |
| `npm run test:e2e` | testes de interface com Playwright, incluindo uma exportação real (`npx playwright install chromium` na primeira vez) |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm start` | build + servidor local servindo a build |

Para testar o layout de celular, abra o DevTools (F12) e use o modo de dispositivo. Na mesma rede Wi-Fi, também dá para abrir o endereço "Network" que o Vite mostra.

## Como usar

- **Mídia**: importe vídeos/imagens (botão, ou arraste arquivos para a janela). Toque num item para inserir na agulha ou arraste para a timeline.
- **Marca**: imagens da pasta `brand/` (logos, selos, molduras). Coloque seus arquivos lá ou envie pelo painel. A logo entra no canto superior: arraste e redimensione por cima da marca d'água que precisa cobrir.
- **Manchetes e molduras**: escolha uma **moldura** (vídeo no topo, central, janela editorial, tela cheia, tela cheia com letreiro) e uma **manchete**, e as duas se encaixam. Cada escolha vira **um único item** na timeline, inserido na agulha. Manchetes: faixa, urgente, tarja lateral, faixa larga, serifado, legenda de câmera, marcador por linha, lower third, GC, ao vivo, letreiro, citação, número, @perfil (com o símbolo do Instagram e `@primeirasnoticias_`), crédito e texto livre. Todas usam as cores da marca, com a logo Primeiras Notícias embutida e animação padrão de 1 s. Pelo inspector você só ajusta texto, alinhamento, caixa alta e corpo. **Restaurar padrão** volta qualquer item à configuração do template. Duplo clique ou duplo toque edita o texto; `*trecho*` fica em destaque.
- **Desfoque**: desenhe um retângulo ou oval sobre o vídeo; mova e ajuste pelas alças. Também pode pixelizar. Para seguir algo em movimento, use keyframes.
- **Inserção**: tudo entra exatamente na agulha, com no máximo 15 s e nunca além do fim do vídeo. Para estender, arraste a borda na timeline.
- **Canvas**: arrastar move; os cantos escalam; as laterais mudam largura/altura (o texto se reorganiza ao vivo); a bolinha gira. No toque, pinça com dois dedos escala e gira; no trackpad, Ctrl+roda escala.
- **Timeline**: arraste blocos (inclusive entre trilhas), puxe as bordas para cortar, ímã nas bordas e na agulha, pinça/Ctrl+roda para zoom. Arraste a **agulha** (cabeça ou corpo) para navegar. Ao chegar perto da borda, a timeline anda sozinha, e o mesmo vale ao esticar ou mover blocos. Embaixo há uma **barra de rolagem larga**, feita para o dedo. No toque, o primeiro toque seleciona e o arraste move o bloco selecionado.
- **Prévia em tela cheia**: botão no transporte (ou tecla `F`). Toque no vídeo para reproduzir ou pausar; `Esc` sai.
- **Dicas**: passe o mouse sobre um botão (ou segure o dedo, no celular) para ver o que ele faz.
- **Exportar**: MP4 H.264 + AAC renderizado pelo mesmo motor do preview (o que você vê é o que sai). Ao terminar, o vídeo é salvo **na memória do aparelho** (pasta Downloads do PC ou do Android). O app não guarda cópia do vídeo final.

Atalhos: `Espaço` reproduzir · `S` dividir · `Delete` excluir (`Shift+Delete` fecha o espaço) · `Ctrl+Z / Ctrl+Shift+Z` · `Ctrl+D` duplicar · `Ctrl+C / Ctrl+V` · `,` `.` quadro a quadro · setas movem o item selecionado.

## Arquitetura

```
src/core/       modelo do projeto (Zod), timeline, animação, cena, áudio, geometria — TypeScript puro, sem DOM nem Node
src/render/     renderizador único em canvas (preview e exportação), manchetes, layout de texto, fontes locais
src/engine/     motor do preview (sincronia de mídia, Web Audio) e exportador quadro a quadro
src/platform/   adaptadores (ProjectStore, MediaService, ExportService) — hoje via HTTP local
src/state/      estado do editor (Zustand), histórico e gestos
src/ui/         React: palco, timeline, painéis, inspector, exportação
server/         API local: SQLite, ingestão de mídia (ffprobe, miniaturas, forma de onda, proxy), exportação FFmpeg
brand/          imagens da marca fornecidas pela redação
```

**WYSIWYG**: `evaluateScene()` + `renderFrame()` desenham cada quadro. O preview chama os dois a cada frame e a exportação faz o mesmo, quadro a quadro, com cada vídeo posicionado no instante exato. Os JPEGs vão em lotes para o FFmpeg (`image2pipe → libx264`). O áudio é mixado a partir dos arquivos originais com o mesmo plano usado pelo player (`buildAudioPlan` → `buildFfmpegAudioGraph`: trim, velocidade, volume, fades, atraso).

### Futuro app Android

Passo a passo completo (Capacitor + GitHub Actions + instalação): [docs/ANDROID.md](docs/ANDROID.md).


Não há APK nesta etapa. A UI só depende das interfaces de `src/platform/api.ts`. Para o Android (por exemplo com Capacitor), basta implementar `ProjectStore`, `MediaService` e `ExportService` com um backend nativo (armazenamento local + codificação via MediaCodec ou FFmpeg compilado para Android). O núcleo (`src/core`) e o renderizador não dependem de Node.

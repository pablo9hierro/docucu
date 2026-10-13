# Gerar o APK Android com GitHub Actions

Este guia leva o Primeiras Notícias Studio (React + Vite) para um APK usando **Capacitor** e **GitHub Actions**.

## Antes de tudo: o que muda no celular

No PC, o app tem duas partes:

1. a interface React (roda no navegador);
2. um servidor Node local com SQLite e FFmpeg (importa mídia, salva projetos, exporta o MP4).

O APK empacota só a **parte 1**. No Android não existe o servidor Node nem o FFmpeg do PC. Por isso, antes de o APK editar e exportar de verdade, é preciso trocar os adaptadores de `src/platform/api.ts` por versões que funcionam dentro do celular:

| Adaptador | No PC (hoje) | No Android |
|---|---|---|
| `ProjectStore` | SQLite no servidor local | `@capacitor-community/sqlite` ou `@capacitor/preferences` |
| `MediaService` | upload + ffprobe | `@capacitor/filesystem` + metadados lidos pelo próprio `<video>` |
| `ExportService` | FFmpeg no servidor | **WebCodecs** (`VideoEncoder` H.264 + `AudioEncoder` AAC) no WebView + muxer MP4 em JS (ex.: `mp4-muxer`) |
| `DeviceStorage` | download para Downloads | `@capacitor/filesystem` em `Directory.Documents`/Download, ou plugin de MediaStore para a galeria |

O caminho recomendado para exportar é o WebCodecs. O renderizador de quadros (`renderFrame`) já é o mesmo do preview, então a exportação passa a acontecer inteira dentro do app, sem FFmpeg. Esse mesmo código também funcionaria no PC.

O restante (núcleo do editor, timeline, manchetes, molduras, gestos) já é React/TypeScript puro e não precisa mudar.

## Passo 1: adicionar o Capacitor ao projeto (no seu PC)

```bash
npm install @capacitor/core @capacitor/android @capacitor/filesystem
npm install -D @capacitor/cli
npx cap init "Primeiras Notícias Studio" br.com.primeirasnoticias.studio --web-dir dist
npm run build
npx cap add android
```

Isso cria a pasta `android/` (projeto Android Studio) e o `capacitor.config.ts`. Faça commit dos dois.

## Passo 2: criar o workflow

Crie o arquivo `.github/workflows/android.yml`:

```yaml
name: APK Android

on:
  workflow_dispatch:        # botão "Run workflow" na aba Actions
  push:
    branches: [pablo]

jobs:
  apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21

      - name: Instalar dependências
        run: npm ci

      - name: Build web (React/Vite)
        run: npx vite build

      - name: Copiar build para o projeto Android
        run: npx cap sync android

      - name: Gerar APK (debug)
        working-directory: android
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Publicar APK
        uses: actions/upload-artifact@v4
        with:
          name: primeiras-noticias-studio-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

## Passo 3: rodar no GitHub

1. Faça commit e push do workflow (`git add .github android capacitor.config.ts package*.json`, depois `git commit` e `git push origin pablo`).
2. No GitHub, abra o repositório e vá em **Actions** → **APK Android**.
3. O workflow roda sozinho a cada push na branch `pablo`. Para rodar manualmente, use **Run workflow**.
4. Quando ficar verde (✓), abra a execução e baixe o artefato **primeiras-noticias-studio-apk** (vem em `.zip`, com o `app-debug.apk` dentro).

## Passo 4: instalar no celular

1. Passe o `app-debug.apk` para o Android (cabo, Drive, WhatsApp para você mesmo).
2. Abra o arquivo e permita **"Instalar apps desconhecidos"** para o app que abriu o APK.
3. Instale.

## Passo 5 (opcional): APK assinado para distribuir

O APK debug serve para testes. Para uma versão de distribuição:

1. Gere uma keystore uma única vez:
   `keytool -genkey -v -keystore pn.keystore -alias pn -keyalg RSA -keysize 2048 -validity 10000`
2. No GitHub: **Settings → Secrets and variables → Actions**, crie:
   - `KEYSTORE_BASE64` com o conteúdo de `base64 pn.keystore`
   - `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`pn`) e `KEY_PASSWORD`
3. No workflow, decodifique a keystore e troque `assembleDebug` por `assembleRelease`, passando a assinatura via `android/app/build.gradle` (`signingConfigs`) ou com `apksigner`.

Guarde a keystore em lugar seguro: sem ela não dá para publicar atualizações do mesmo app.

# English Coach

App de voz para practicar inglés todos los días con IA (Gemini). Es una PWA: se instala en el celular desde Chrome.

**App:** https://ivangg97.github.io/english-coach/

## Qué hace

- **Conversación libre** y **entrevista técnica** en inglés, con nivel ajustable (A2 a C1) y tema opcional.
- **Modo Live:** voz a voz en tiempo real con Gemini Live (se puede interrumpir, como una llamada).
- **Modo turnos (respaldo):** reconocimiento de voz de Chrome + Gemini Flash-Lite + voz del sistema. Se activa solo si Live falla o se queda sin cuota.
- **Resumen al terminar:** correcciones con diff, frases más naturales, vocabulario y un objetivo para la próxima sesión (explicado en español).
- **Racha diaria**, meta de minutos e historial de sesiones (guardado en el celular).

## Cómo usarla

1. Crear una API key gratis en [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Abrir la app en Chrome → **Ajustes** → pegar la key → **Guardar y detectar modelos**.
3. Menú de Chrome → **Agregar a la pantalla principal** para instalarla.

La API key queda guardada solo en el navegador del celular (`localStorage`), nunca en este repo. Recomendado: en Google Cloud Console, restringir la key al referrer `https://ivangg97.github.io/*`.

## Stack

HTML + JavaScript sin build, [`@google/genai`](https://www.npmjs.com/package/@google/genai) desde CDN, Web Audio API (AudioWorklet para capturar PCM 16 kHz), Web Speech API, Service Worker.

## Archivos

- `index.html`, `app.js` — la app
- `sw.js`, `manifest.webmanifest`, `icon-*.png` — PWA
- `test.html` — página de pruebas del modelo local (WebLLM / Whisper), descartado por lento

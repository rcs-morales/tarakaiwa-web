# 🗣️ TaraKaiwa

TaraKaiwa (from the Filipino word “Tara = let’s” and the Japanese word “Kaiwa = talk”) is a browser-based JLPT speaking practice app. It helps learners practice speaking, listening, translation, and grammar feedback with AI-powered tools that run entirely in the client.

**🌍 Live Demo**: Vercel (https://tarakaiwa-web.vercel.app/)  
Add a Groq API key in Settings for speech recognition and AI grading. Voicevox remains optional for cloud text-to-speech.

## ✨ What’s New

- **AI Study Assistant** for grammar explanations, vocabulary help, and follow-up study guidance.
- **Translation Tool** for quick English-to-Japanese phrase practice with voice input and playback.
- **Cleaner Japanese rendering** in the translation panel for more readable phrase display.
- **Expanded test coverage** for parser and assistant behavior using Vitest.
- **Offline-friendly persistence** via local storage and IndexedDB for settings, keys, and cached audio.

## ✨ Core Features

- **AI-powered speech recognition** using Groq Whisper or the browser’s Web Speech API.
- **Intelligent grading** with grammar and vocabulary feedback, with strictness tuned for JLPT levels N5–N3.
- **AI study assistant** for clarifying doubts and guiding practice.
- **AI translation tool** for quick phrase translation and speaking practice.
- **Immersive audio and visuals** with browser voices or VOICEVOX plus a Live2D-style avatar experience.
- **Offline audio caching** so repeated Voicevox requests are faster and more reliable.
- **Guided practice** with romaji support, randomized sessions, and starter datasets.
- **Local privacy** with no backend required; API keys and data are stored in the browser.

## 🚀 Getting Started

This project is a client-side vanilla JavaScript app with ES modules and no build step.

### Prerequisites

1. A modern browser. Chrome or Edge is recommended for voice-recognition workflows.
2. A free [Groq API key](https://console.groq.com/keys) for AI speech recognition and grading.
3. *(Optional)* VOICEVOX support via the free community API at api.tts.quest.
4. *(Optional for faster TTS)* Install [VOICEVOX](https://voicevox.hiroshiba.jp/) locally to avoid community-server latency.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rcs-morales/tarakaiwa-web.git
   ```
2. Navigate to the project folder:
   ```bash
   cd tarakaiwa-web
   ```
3. Install local dependencies for testing:
   ```bash
   npm install
   ```
4. Serve the directory with any static server, for example:
   ```bash
   python -m http.server 8000
   ```
5. Open http://localhost:8000 in your browser.
6. If you are setting up Groq for the first time, use the in-app setup guide or open groq-guide.html for setup help.

### Testing

Run the regression suite with:

```bash
npm test
```

## 📖 How to Use

1. **Configure AI**: Paste your Groq API key into the AI Settings area and save it.
2. **Adjust settings**: Choose the speech engine, TTS mode, grading strictness, and voice.
3. **Import data**: Import Japanese Q&A data in JSON, CSV, or Excel format.
4. **Practice**: Start a session and the app will prompt you, record your response, and give feedback.
5. **Use the translation or assistant tools**: Open the translation panel for quick phrase practice or the study assistant for grammar help.

## 🏗️ Project Structure

| File/Folder | Role |
|-------------|------|
| index.html | Main markup and application layout |
| assets/style.css | Layout, theme, and UI styling |
| src/app.js | Main entry point and app orchestration |
| src/ai/ | AI modules for grading, Groq requests, Whisper, and study assistance |
| src/session.js | Practice-session flow and state |
| src/settings.js | Persistent configuration management |
| src/db.js | IndexedDB wrapper for cached audio and local data |
| src/import.js | Parsing and import of external Q&A datasets |
| src/stt.js | Speech-to-text logic |
| src/tts.js | Text-to-speech logic |
| src/avatar.js | Avatar rendering and voice mapping |
| src/parser.js | Text parsing and translation rendering helpers |
| src/ui.js | DOM updates and UI state management |
| src/translate-ui.js | Translation tool UI and behavior |
| src/assistant-ui.js | Study assistant UI |
| src/data.js | Default starter Q&A dataset |
| tests/ | Unit and integration tests |
| groq-guide.html | Groq setup guide |

## 🗺️ Roadmap

- [x] JLPT-style speaking practice support
- [x] AI grading and speech recognition
- [x] AI study assistant and translation tool
- [x] Voicevox cloud TTS and offline audio caching
- [x] Hybrid avatar system
- [ ] Add more N4/N3 datasets
- [ ] Improve mobile responsiveness and polish

## 📄 License & Credits

This project is open-source and available for educational use.

**Live2D Avatar Credits**: This app uses sample model data provided by Live2D Inc. under the applicable Free Material License terms.

**VOICEVOX Audio Generation**: Audio synthesis is powered by VOICEVOX and served through the free community API at api.tts.quest. Please follow the relevant character terms of service when using VOICEVOX characters.

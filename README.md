# 🗣️ TaraKaiwa

TaraKaiwa is a web-based application designed to help Japanese language learners practice their speaking skills. Currently tailored for **JLPT N5** level practice, the app uses AI to evaluate pronunciation, vocabulary, and grammar in real-time.

**🌍 Live Demo**: on Vercel (https://tara-kaiwa-web.vercel.app/) *(Add a Groq API key in settings for AI speech recognition and grading. VOICEVOX is optional for local AI text-to-speech.)*

## ✨ Key Features

- **AI-Powered Speech Recognition**: High-accuracy STT via Groq Whisper or live preview using the browser's Web Speech API.
- **Intelligent AI Grading**: Real-time feedback on grammar and vocabulary with adjustable strictness based on JLPT level (N5, N4, N3).
- **Immersive Audio & Visuals**: High-quality VOICEVOX or browser voices paired with a lip-syncing Live2D avatar that automatically maps to the voice.
- **Rich Learning Aids**: Furigana readings for kanji, a final score overlay, and sound effects for a responsive, gamified feel.
- **Guided Practice**: Tutorial mode with romaji, randomized sessions, and a built-in starter dataset.
- **Local Privacy**: No backend required; API keys and data are stored securely in your browser's `localStorage`.

## 🚀 Getting Started

You can use the live deployed version on Vercel immediately, or run it locally. This is a client-side vanilla JavaScript app with no build step.

### Prerequisites

1. A modern web browser. Chrome or Edge is required for the live voice-recognition workflow in this app.
2. A free [Groq API Key](https://console.groq.com/keys) for AI speech recognition and grading.
3. *(Optional)* Select VOICEVOX in the settings to automatically use the free community `api.tts.quest` service for cloud-based TTS. No setup required!
4. *(Optional - For Faster TTS)* If you find the cloud Voicevox service too slow, you can download and install [VOICEVOX](https://voicevox.hiroshiba.jp/) on your computer. Running it locally provides instant audio generation without relying on community servers.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rcs-morales/jlpt-speaking-app-web.git
   ```
2. Navigate to the project folder:
   ```bash
   cd jlpt-speaking-app-web
   ```
3. Serve the directory using any local web server. For example, using Python:
   ```bash
   python -m http.server 8000
   ```
4. Open `http://localhost:8000` in your browser.
5. If you are setting up Groq for the first time, use the in-app setup guide link or open `groq-guide.html` for the recommended configuration steps.

## 📖 How to Use

1. **Configure AI**: On the home screen, paste your Groq API key into the AI Settings section and click **Save Key**.
2. **Adjust settings**: Choose grading speed (balanced or fast Groq model), speech recognition engine, text-to-speech mode (browser or VOICEVOX), JLPT grading strictness, and voice.
3. *(Optional)* **Local Voicevox Setup**: If you installed Voicevox locally for faster audio, open `src/tts.js` and change `const VOICEVOX_API = 'https://api.tts.quest/v3/voicevox/synthesis';` to `const VOICEVOX_API = 'http://localhost:50021/synthesis';` (or similar depending on your local API routing).
4. **Use the setup guide if needed**: If Groq or Whisper setup is unclear, open the included guide page (`groq-guide.html`) for the recommended flow.
5. **Import Data**: Import your Japanese Q&A database (JSON format).
6. **Practice**: Click **Start Practice!** The app speaks the question aloud, records your answer, and returns instant AI grading and feedback.

## 🏗️ Project Structure

The codebase is built with vanilla JavaScript using ES6 Modules:

| File | Role |
|------|------|
| `index.html` | Markup, settings UI, and tutorial answer display |
| `style.css` | Layout, theme, and UI component styling |
| `app.js` | Main entry point; coordinates state, practice flow, and module integration |
| `ai.js` | Groq API integration (Llama 3 grading & Whisper STT) |
| `stt.js` | Speech-to-Text logic (Web Speech API & audio recording for Whisper) |
| `tts.js` | Text-to-Speech logic (Browser built-in & VOICEVOX) |
| `avatar.js` | Hybrid avatar system: manages PixiJS Live2D models (Chitose) and static portrait switching for Voicevox |
| `parser.js` | File parsing (JSON, CSV, Excel) and fuzzy furigana conversion |
| `ui.js` | DOM manipulation and UI state updates |
| `data.js` | Default starter Q&A dataset |
| `groq-guide.html` | Recommended Groq setup and key configuration guide |

## 🗺️ Roadmap

- [x] N5 Speaking Practice Support
- [x] Advanced AI Grading (Groq)
- [x] High-accuracy AI Speech Recognition (Whisper)
- [x] Cloud AI text-to-speech (VOICEVOX via api.tts.quest)
- [x] Hybrid Avatar system (Live2D + Static Portraits)
- [x] Randomized Question Order per Session
- [ ] Add N4 & N3 Q&A Databases
- [ ] Mobile-responsive UI improvements

## 📄 License & Credits

This project is open-source and available for educational use.

**Live2D Avatar Credits**:
This app uses a sample model provided by **Live2D Inc.** The use of these materials is governed by the [Free Material License Agreement](https://www.live2d.com/en/sdk/sample/) and the [Terms of Use for Live2D Cubism Sample Data](https://www.live2d.com/en/sdk/sample/). 

**VOICEVOX Audio Generation**:
Audio synthesis is powered by [VOICEVOX](https://voicevox.hiroshiba.jp/) and served through the free community API [api.tts.quest](https://tts.quest/). When using VOICEVOX characters (e.g., Zundamon, Shikoku Metan), please adhere to their respective character terms of service. 


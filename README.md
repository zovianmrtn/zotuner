# ZoTuner

A browser guitar tuner for six-string acoustic and electric guitars. Built with TypeScript, Vite, Tailwind and Web Audio. Microphone processing runs locally using YIN with an AudioWorklet and an AnalyserNode fallback.

## Run locally

Use Node.js 22.12 or later and run `npm ci`, then `npm run dev`. Open the localhost URL and choose **Start tuning**. On another device the microphone requires HTTPS.

## Build and test

Run `npm test` for pitch fixtures at 44.1 and 48 kHz. Run `npm run build` to type-check and build the static site into `dist/`.

## Controls

Pick one of eight tuning presets. Auto String follows the closest string. Select a peg or string to enter Manual Peg and hear its reference tone. A string is checked after staying within ±2 cents for half a second. Choose Settings to select a microphone, change concert pitch or adjust reference volume. Pause the microphone with Listening.

Settings are stored in the browser. Audio is neither stored nor transmitted. Font and icon licenses are included in `public/licenses/`.


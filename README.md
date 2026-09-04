# 4·7·8 Breath

A focused, private 4-7-8 guided breathing PWA designed for iPhone and Android.

## Highlights

- 3-second preparation countdown
- 4 sec inhale · 7 sec hold · 8 sec exhale
- Male voice, female voice, ting-only, or silent guidance
- Soft completion chime
- ~3, ~6 and ~10 minute session presets plus custom rounds
- +2 rounds during an active session
- Daily 6-minute goal
- Training log, 7-day graph, monthly activity calendar and streak
- Session recovery after interruption
- Haptics and screen wake lock where supported
- Larger-text and reduced-motion accessibility support
- Offline PWA support
- Training data is stored locally on the device only

## Run locally

Open `index.html` directly for a basic preview, or serve the folder over HTTP for full PWA/service-worker behaviour.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

This repository is static and can be hosted directly with GitHub Pages.

1. Push these files to the repository root.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the main branch and `/ (root)`.
5. Save, then open the Pages URL in Safari on the iPhone.
6. Use **Share → Add to Home Screen**.

## Notes

Voice guidance uses the device's installed system voices, so the exact male or female voice can differ between iPhone, Android, Windows and macOS.


## v6
- Fixed Android breathing-guide rendering artefacts.
- Added Singing bowl, Breath tone and Soft chime guidance modes.


## v8 fix
- Preserves the animated breathing trail from v6.
- Fixes completed round dots inheriting the generic Settings `.done` button width, which created one full-width purple line after every completed round.


## v9 iOS audio reliability fix
- Primes Web Audio and speech synthesis from the user's Start/Resume/Preview tap.
- Recreates the Web Audio context after returning from the background on iOS.
- Keeps all v8 breathing animation and purple-bar fixes unchanged.


## v10 audio reliability
- Uses real MP3 files for Ting, Singing Bowl, Soft Chime and the completion chime.
- Keeps Breath Tone as Web Audio because it follows the inhale/hold/exhale duration.
- Male and female system speech remain the preferred natural voice.
- Adds pre-recorded male/female MP3 fallbacks if iOS speech synthesis does not start.
- Primes the HTML5 audio player from Start, Resume and Preview taps for iOS Home Screen PWA reliability.
- Preserves the v8 breathing guide and completed-round-dot fix.


## v11 polished audio
- Softer, less notification-like Ting.
- Warmer Singing Bowl with a longer natural decay.
- Airier Soft Chime with gentler harmonics.
- Calmer three-note Completion Chime.
- Smoother male/female prerecorded fallback clips.
- Keeps v10's iOS-safe HTML5 audio architecture and v8's breathing-guide/purple-bar fixes.

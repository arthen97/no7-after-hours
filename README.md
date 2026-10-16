# No. 7 — After Hours

A late-night private karaoke room game with interactive Three.js characters, 3D room assets, and host selection. Mira's cover uses the actual in-game 3D character render.

## Download the game

Download `No7-After-Hours-v1.0.0.zip` from this repository's Releases and extract it. The archive contains the complete runnable project and media assets.

## Run locally

Requires Python 3.9 or newer. No Node packages are required.

```sh
python3 salon_server.py
```

Open <http://127.0.0.1:4328/>. The visual game and manual action controls work locally. Live chat and voice generation require a Merouter API key; keep it in your shell environment and never commit it:

```sh
export MEROUTER_SERVICE_KEY="your-key"
```

The server also accepts `MEROUTER_API_KEY`. Without a key, the game still opens, but live generation is unavailable. Local Laya inference is optional; manual action controls remain available when that runtime is unavailable.

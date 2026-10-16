# No. 7 — After Hours

A late-night private karaoke room game with interactive Three.js characters, 3D room assets, host selection, and an authored browser-playable story mode.

## Play online

Open <https://arthen97.github.io/no7-after-hours/>. The public web version runs in the browser—no download, install, account, or API key is needed. Choose a host, enter the room, use the movement controls, and send lines for story-mode replies. Room ambience and optional browser speech are included.

The public Pages version uses authored story replies and browser speech. The local Python server remains available for Merouter-powered chat and generated voices; configure its key in your environment and never put it in the public repository.

## Run the local service

Requires Python 3.9 or newer:

```sh
python3 salon_server.py
```

Open <http://127.0.0.1:4328/>. To enable live chat and generated voice, set `MEROUTER_SERVICE_KEY` (or `MEROUTER_API_KEY`) before starting the server. Local Laya inference is optional; manual interaction remains available without it.

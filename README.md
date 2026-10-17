# No. 7 — After Hours

A late-night private karaoke room game with interactive Three.js characters, 3D room assets, host selection, and an authored browser-playable story mode.

## Play online

Open <https://arthen97.github.io/no7-after-hours/>. The public web version runs in the browser—no download, install, account, or API key is needed. Choose a host, enter the room, use the movement controls, and send lines for story-mode replies. Room ambience is included. Voice uses the connected Merouter service.

The public Pages version uses authored story replies when no backend is configured. The local Python server remains available for Merouter-powered chat and generated voices; configure its key in your environment and never put it in the public repository.

## Run the local service

Requires Python 3.9 or newer:

```sh
python3 salon_server.py
```

Open <http://127.0.0.1:4328/>. To enable live chat and generated voice, set `MEROUTER_SERVICE_KEY` (or `MEROUTER_API_KEY`) before starting the server. Local Laya inference is optional; manual interaction remains available without it.

## Merouter voice service

Voice now uses only Merouter `eleven_v4` through `/api/speech`. Browser speech
synthesis is not used. GitHub Pages alone cannot run this service; until a backend
is deployed, the public page shows that voice is disconnected.

Deploy the included Dockerfile on a server with an HTTPS endpoint. Set
`MEROUTER_SERVICE_KEY` (or `MEROUTER_API_KEY`) in the hosting platform's secret
settings and `ALLOWED_ORIGINS=https://arthen97.github.io`. Set `PORT` if required
by the platform. Then set `apiBase` in `public/service-config.js` to that HTTPS
origin and publish the page. Never put the Merouter credential in that file.
The existing process-wide generation limits apply (10 requests/minute and 120
per process for each service); configure production quotas before wider use.
Laya inference is optional and absent from the container; manual action buttons
remain available.

Mira's restored cover is the original Grok Imagine Image 2.0 output from
`worlds-slg-demo/production/host-v39/posters/run-mira/artifacts/mira.jpg`.

For Menv or another Node host, use `npm start` (Node 20+). This serves the game and its API together. The service accepts `PORT`, `MEROUTER_SERVICE_KEY` / `MEROUTER_API_KEY`, and `ALLOWED_ORIGINS`.

#!/usr/bin/env python3
"""Start the local No. 7 game server and open it in the default browser."""
from __future__ import annotations

import sys
import time
import subprocess
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:4328/"


def is_running() -> bool:
    try:
        with urllib.request.urlopen(URL, timeout=1) as response:
            return response.status == 200 and b"no. 7" in response.read(20000).lower()
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def main() -> int:
    if sys.version_info < (3, 9):
        print("No. 7 needs Python 3.9 or newer. Please install a current Python 3 release.")
        return 1

    if is_running():
        print(f"No. 7 is already running: {URL}")
        webbrowser.open(URL)
        return 0

    server = subprocess.Popen(
        [sys.executable, str(ROOT / "salon_server.py")],
        cwd=ROOT,
    )
    deadline = time.monotonic() + 30
    try:
        while time.monotonic() < deadline:
            if server.poll() is not None:
                print("The game server stopped during startup. Check that port 4328 is available.")
                return int(server.returncode or 1)
            if is_running():
                print(f"No. 7 is ready: {URL}")
                webbrowser.open(URL)
                return server.wait()
            time.sleep(0.4)
        print("The game server did not start within 30 seconds.")
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == "__main__":
    raise SystemExit(main())

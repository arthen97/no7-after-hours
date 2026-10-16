#!/bin/bash
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.9 or newer is required. Install Python 3, then double-click this file again."
  read -r -p "Press Return to close..."
  exit 1
fi
python3 launch_no7.py
status=$?
echo
read -r -p "No. 7 has stopped. Press Return to close..."
exit "$status"

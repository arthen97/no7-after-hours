@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 launch_no7.py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python launch_no7.py
  ) else (
    echo Python 3.9 or newer is required. Install Python 3, then double-click this file again.
    pause
    exit /b 1
  )
)
if errorlevel 1 pause

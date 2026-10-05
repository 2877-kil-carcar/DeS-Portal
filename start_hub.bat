@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 hub_server.py
) else (
  python hub_server.py
)
if errorlevel 1 echo Python 3 をインストールしてから、もう一度実行してください。
pause

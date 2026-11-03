@echo off
cd /d "%~dp0"
echo Updating Islamic videos feed...
python fetch_feeds.py
pause


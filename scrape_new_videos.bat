@echo off
cd /d "%~dp0"
node scrape_new_videos.js %*
if "%~1"=="" pause


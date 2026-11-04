@echo off
cd /d "%~dp0"
node remove_channel.js %*
if "%~1"=="" pause


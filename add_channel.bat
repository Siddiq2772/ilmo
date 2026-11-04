@echo off
cd /d "%~dp0"
node add_channel.js %*
if "%~1"=="" pause


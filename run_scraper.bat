@echo off
setlocal
cd /d "%~dp0"
py -m pip install --upgrade requests beautifulsoup4
if errorlevel 1 (
  echo Failed to install Python dependencies.
  pause
  exit /b 1
)
py scrape_islam_channels.py --out "%~dp0"
set RESULT=%ERRORLEVEL%
echo.
if "%RESULT%"=="0" (
  echo Scraping completed and matched the site's total.
) else if "%RESULT%"=="1" (
  echo Scraping completed, but the count did not match 962. See scrape_report.json.
) else (
  echo Scraping failed. See scrape_report.json for the error.
)
pause
exit /b %RESULT%

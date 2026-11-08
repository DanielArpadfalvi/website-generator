@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Outreach CRM

where node >nul 2>nul
if errorlevel 1 (
  echo [HIBA] A Node.js nincs telepitve. Toltsd le: https://nodejs.org  ^(LTS verzio^)
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  Letrehoztam a .env fajlt. Nyisd meg, es ird bele a Supabase adatbazis jelszot
  echo  a [YOUR-PASSWORD] helyere, majd inditsd ujra ezt a fajlt.
  echo.
  notepad ".env"
  pause
  exit /b 0
)

if not exist "node_modules" (
  echo Fuggosegek telepitese...
  call npm install --no-audit --no-fund
)

start "" http://localhost:4310
node --env-file=.env server.js
pause

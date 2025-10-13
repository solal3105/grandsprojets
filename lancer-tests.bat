@echo off
echo Nettoyage du port 3000...

REM Trouver et tuer le processus sur le port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Arret du processus %%a sur le port 3000
    taskkill /PID %%a /F >nul 2>&1
)

echo Lancement des tests...
npm run test:contrib:ui

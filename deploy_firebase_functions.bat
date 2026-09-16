@echo off
title EliteXGamers Firebase Functions Deploy
cd /d "%~dp0\..\..\..\functions"
echo.
echo ========================================================
echo Deploying Cloud Functions for project elitexgamers-17353...
echo ========================================================
echo.
call npm install
call npm run build
call firebase deploy --only functions --project elitexgamers-17353
echo.
pause

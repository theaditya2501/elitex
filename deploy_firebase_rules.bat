@echo off
title EliteXGamers Firebase Rules Deploy
cd /d "%~dp0"
echo.
echo Deploying Firestore rules for project elitexgamers-17353...
echo.
firebase deploy --only firestore:rules --project elitexgamers-17353
echo.
pause

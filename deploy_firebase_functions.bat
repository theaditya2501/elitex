@echo off
title EliteXGamers Firebase Functions Deploy
cd /d "%~dp0..\..\.."

:: Set paths to bundled Node.js, TypeScript, and Firebase CLI
set "PATH=%CD%\.tools\node;%PATH%"
set "NODE_EXE=%CD%\.tools\node\node.exe"
set "TSC_BIN=%CD%\functions\node_modules\typescript\bin\tsc"
set "FIREBASE_JS=%CD%\functions\node_modules\firebase-tools\lib\bin\firebase.js"

echo.
echo ========================================================
echo   EliteXGamers Firebase Functions Deploy
echo   Target Project: elitexgamers-17353
echo ========================================================
echo.

:: Step 1: Check Firebase Authentication
echo [1/3] Checking Firebase authentication...
"%NODE_EXE%" "%FIREBASE_JS%" login:list | findstr /i "@" >nul
if errorlevel 1 (
    echo.
    echo --------------------------------------------------------
    echo  Please log in with the Google account that owns
    echo  the Firebase project 'elitexgamers-17353'.
    echo  A browser window will open now...
    echo --------------------------------------------------------
    echo.
    "%NODE_EXE%" "%FIREBASE_JS%" login
    if errorlevel 1 (
        echo.
        echo [ERROR] Firebase login was not completed.
        echo Please run this script again and complete the browser login.
        pause
        exit /b 1
    )
) else (
    echo  Firebase account is authenticated!
)

:: Step 2: Build TypeScript Cloud Functions
echo.
echo [2/3] Compiling TypeScript Cloud Functions...
"%NODE_EXE%" "%TSC_BIN%" -p "%CD%\functions"
if errorlevel 1 (
    echo.
    echo [ERROR] TypeScript compilation failed.
    pause
    exit /b 1
)
echo  TypeScript build successful!

:: Step 3: Deploy Cloud Functions to Firebase
echo.
echo [3/3] Deploying Cloud Functions to elitexgamers-17353...
"%NODE_EXE%" "%FIREBASE_JS%" deploy --only functions --project elitexgamers-17353

if errorlevel 1 (
    echo.
    echo [ERROR] Deployment failed. Please review the errors above.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   Deployment SUCCESSFUL!
echo   Single Sign-On (SSO) functions are now live!
echo ========================================================
pause

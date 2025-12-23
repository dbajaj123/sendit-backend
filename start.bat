@echo off
echo ========================================
echo SenditBox Backend - Quick Start
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Step 1: Installing dependencies...
    call npm install
    echo.
) else (
    echo Dependencies already installed.
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo Step 2: Creating .env file...
    copy .env.example .env
    echo Please edit .env file with your MongoDB connection string!
    echo.
    pause
) else (
    echo .env file exists.
    echo.
)

echo Step 3: Starting the server...
echo.
echo Server will start at http://localhost:5000
echo Press Ctrl+C to stop the server
echo.
npm run dev

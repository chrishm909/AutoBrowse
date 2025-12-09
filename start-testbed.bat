@echo off
echo Starting AutoBrowse Testbed Server...
echo.

cd testbed

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server...
call npm start

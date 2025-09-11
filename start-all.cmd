@echo off
chcp 65001 >nul
echo Starting HTTP Proxy SSE test environment...
echo.
echo This will start:
echo - Test SSE/JSON Server (port 8081)
echo - HTTP Proxy (port from settings.json, default 3002)
echo - Test Client
echo.
echo Press any key to start all components...
pause

cd /d "%~dp0"

echo.
echo Starting Test SSE/JSON Server...
start "Test SSE Server" cmd /k "npm run start:test-server"

timeout /t 2 /nobreak >nul

echo Starting HTTP Proxy...
start "HTTP Proxy SSE" cmd /k "npm run dev"

timeout /t 2 /nobreak >nul

echo Starting Test Client...
start "Test Client" cmd /k "npm run start:test-client"

echo.
echo All components started in separate windows.
echo Close the opened windows to stop components.
echo.
pause



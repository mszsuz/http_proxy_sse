@echo off
setlocal
cd /d "%~dp0"
echo Starting test SSE/JSON server (8081)...
npm run start:test-server
pause



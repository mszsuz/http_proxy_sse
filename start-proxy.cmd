@echo off
setlocal
cd /d "%~dp0"
echo Starting http-proxy-sse (dev)...
npm run dev
pause



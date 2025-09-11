@echo off
setlocal
cd /d "%~dp0"
echo Running test client against proxy...
npm run start:test-client
pause



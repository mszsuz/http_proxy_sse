@echo off
chcp 65001 >nul
echo [STOP] Освобождение портов 3002 и 8081...
echo.

echo [INFO] Поиск процессов на портах 3002 и 8081...
netstat -ano | findstr ":3002\|:8081"

echo.
echo [INFO] Поиск всех процессов Node.js...
tasklist | findstr "node.exe"

echo.
echo [KILL] Закрытие всех процессов Node.js...
for /f "tokens=2" %%i in ('tasklist ^| findstr "node.exe"') do (
    echo Закрытие процесса PID: %%i
    taskkill /f /pid %%i >nul 2>&1
)

echo.
echo [CHECK] Проверка освобождения портов...
netstat -ano | findstr ":3002\|:8081"

if %errorlevel% equ 1 (
    echo [OK] Порты 3002 и 8081 свободны!
) else (
    echo [WARN] Некоторые порты все еще заняты
)

echo.
echo [DONE] Готово! Все порты обработаны.
pause



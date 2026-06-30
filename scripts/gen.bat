@echo off
set LOG=D:\ai-learning-agent\data\generate.log
echo [%date% %time%] Start >> "%LOG%"
"C:\Program Files\nodejs\node.exe" "D:\ai-learning-agent\scripts\generate-report.js" >> "%LOG%" 2>&1
echo [%date% %time%] Done: %ERRORLEVEL% >> "%LOG%"

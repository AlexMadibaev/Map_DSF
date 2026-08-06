@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules" call npm.cmd install
start "" "http://localhost:5173"
call npm.cmd run dev

@echo off
title Stop WhatAps Server
echo Menghentikan proses yang mendengarkan port 3001...
for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /f /pid %%P
echo Selesai. Server sudah dimatikan.
pause
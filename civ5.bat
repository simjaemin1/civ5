@echo off
rem civ5: pull latest code and run (no tests). Usage: civ5.bat [dev|online|share] [branch]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" %*
if errorlevel 1 pause

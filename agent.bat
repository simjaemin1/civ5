@echo off
rem civ5 helper: run Claude (Agent SDK, API credits) on this repo. Usage: agent.bat ["task"]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\agent.ps1" %*
if errorlevel 1 pause

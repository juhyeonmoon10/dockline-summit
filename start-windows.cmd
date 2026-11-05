@echo off
setlocal
cd /d "%~dp0"
set "DOCKLINE_NODE="
for %%N in (node.exe) do set "DOCKLINE_NODE=%%~$PATH:N"
if not defined DOCKLINE_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "DOCKLINE_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined DOCKLINE_NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "DOCKLINE_NODE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined DOCKLINE_NODE if exist "%UserProfile%\.local\node\node.exe" set "DOCKLINE_NODE=%UserProfile%\.local\node\node.exe"
if not defined DOCKLINE_NODE goto :install
"%DOCKLINE_NODE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 goto :install
"%DOCKLINE_NODE%" server.mjs
goto :done
:install
echo Install Node.js 18 or later on this host computer, then double-click this file again.
echo Official website: https://nodejs.org/
echo The participating Chromebooks only need Chrome.
:done
pause

@echo off
echo Starting Dungeon Lair backend and frontend...

start "Dungeon Lair - Server" cmd /k "cd /d %~dp0server && npm start"
start "Dungeon Lair - Client" cmd /k "cd /d %~dp0client && npm run dev"

echo Both servers are starting in separate windows.

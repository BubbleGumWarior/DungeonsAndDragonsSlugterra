@echo off
echo Starting Dungeon Lair backend and frontend...
echo (localhost only -- this never touches dungeonlair.co.za or Railway,
echo  safe to run anytime even while the live Railway site is up)

start "Dungeon Lair - Server" cmd /k "cd /d %~dp0server && npm start"
start "Dungeon Lair - Client" cmd /k "cd /d %~dp0client && npm run dev"

echo Both servers are starting in separate windows.
echo Open http://localhost:5173

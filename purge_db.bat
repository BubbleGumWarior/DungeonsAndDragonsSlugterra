@echo off
setlocal

echo ============================================================
echo   DATABASE PURGE (local testing only)
echo ============================================================
echo.
echo This will PERMANENTLY DELETE every table and all data in the
echo local database configured in server\.env (PGDATABASE).
echo.
echo It does NOT touch dungeonlair.co.za or Railway -- local only.
echo.
echo The next time you start the server (run.bat), an empty schema
echo is rebuilt and the default slug/mecha templates are re-seeded.
echo All users, characters, encounters, slugs, etc. will be gone.
echo.

set "CONFIRM="
set /p "CONFIRM=Type  PURGE  (all caps) to continue, anything else to cancel: "

if /i not "%CONFIRM%"=="PURGE" (
  echo.
  echo Cancelled. Nothing was changed.
  echo.
  pause
  exit /b 1
)

echo.
echo Purging...
echo.
pushd "%~dp0server"
call node src/purgeDb.js --yes
set "RESULT=%ERRORLEVEL%"
popd

echo.
if "%RESULT%"=="0" (
  echo Purge complete. Start the server with run.bat to rebuild the schema.
) else (
  echo Purge failed. See the error above.
)
echo.
pause
exit /b %RESULT%

@echo off
title Arina
cd /d "%~dp0"
cd ..

rem -- Verificar Node.js --------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encontro Node.js en esta PC.
  echo   Instalalo desde https://nodejs.org  [elegi la version LTS]
  echo   y volve a hacer doble clic en este archivo.
  echo.
  pause
  exit /b
)

rem -- Version de este paquete vs. la que quedo instalada la ultima vez --
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set APP_VERSION=%%v
set MARKER=.arina-installed-version
set INSTALLED_VERSION=
if exist "%MARKER%" set /p INSTALLED_VERSION=<"%MARKER%"

if not exist "backend\node_modules"      goto install
if not exist "frontend\node_modules"     goto install
if not exist "backend\dist\index.js"     goto install
if not exist "frontend\dist\index.html"  goto install
if not "%INSTALLED_VERSION%"=="%APP_VERSION%" goto install
goto run

:install
echo ================================================================
echo   Instalando Arina version %APP_VERSION%.
echo   Esto puede tardar varios minutos. No cierres esta ventana.
echo ================================================================
echo.

rem Si habia una version anterior instalada (con node_modules, dist o base
rem de datos de un esquema viejo), se borra todo para evitar mezclar codigo
rem viejo con el nuevo. La base de datos tambien se reinicia.
if exist "backend\node_modules"    rmdir /s /q "backend\node_modules"
if exist "backend\dist"            rmdir /s /q "backend\dist"
if exist "frontend\node_modules"   rmdir /s /q "frontend\node_modules"
if exist "frontend\dist"           rmdir /s /q "frontend\dist"
if exist "backend\prisma\arina.db" del /q "backend\prisma\arina.db"

echo [1/5] Instalando el servidor...
pushd backend
call npm install || goto error
echo [2/5] Preparando la base de datos...
call npm run setup || goto error
echo [3/5] Compilando el servidor...
call npm run build || goto error
popd

echo [4/5] Instalando la interfaz...
pushd frontend
call npm install || goto error
echo [5/5] Compilando la interfaz...
call npm run build || goto error
popd

> "%MARKER%" echo %APP_VERSION%

echo.
echo   Instalacion completa.
echo.

:run
echo ================================================================
echo   Arina esta corriendo (version %APP_VERSION%).
echo   Abri en el navegador:  http://localhost:3210
echo   Para cerrar la app, cerra esta ventana.
echo ================================================================
start "" http://localhost:3210
node backend\dist\index.js
goto end

:error
popd
echo.
echo   Hubo un error. Revisa los mensajes de arriba.
echo.
pause
exit /b

:end
pause

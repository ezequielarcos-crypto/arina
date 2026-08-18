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

rem -- Instalar solo la primera vez --------------------------------
if not exist "backend\node_modules"      goto install
if not exist "frontend\node_modules"     goto install
if not exist "backend\dist\index.js"     goto install
if not exist "frontend\dist\index.html"  goto install
goto run

:install
echo ================================================================
echo   Primera vez: instalando Arina.
echo   Esto puede tardar varios minutos. No cierres esta ventana.
echo ================================================================
echo.

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

echo.
echo   Instalacion completa.
echo.

:run
echo ================================================================
echo   Arina esta corriendo.
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

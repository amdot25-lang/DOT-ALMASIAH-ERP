@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js غير مثبت. نزله من https://nodejs.org ثم شغل الملف مرة أخرى.
  pause
  exit /b 1
)
echo تثبيت أداة Firebase...
call npx firebase-tools --version
if errorlevel 1 exit /b 1
echo تسجيل الدخول إلى Google...
call npx firebase-tools login
if errorlevel 1 exit /b 1
echo اختيار مشروع dot-diamond...
call npx firebase-tools use dot-diamond
if errorlevel 1 exit /b 1
echo نشر القواعد والموقع...
call npx firebase-tools deploy --only firestore:rules,hosting
if errorlevel 1 exit /b 1
echo.
echo تم النشر بنجاح: https://dot-diamond.web.app
pause

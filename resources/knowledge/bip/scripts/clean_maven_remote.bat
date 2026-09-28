@echo off
REM 清理 Maven 本地仓库中所有 _remote.repositories 文件
REM 用法: cl.bat 或直接拖动仓库文件夹到此脚本
set REPO_DIR=%1
if "%REPO_DIR%"=="" set REPO_DIR=E:\NCProject\BIP\luzhoulaojiao\repository

echo 正在删除所有 _remote.repositories 文件...
for /r "%REPO_DIR%" %%i in (_remote.repositories) do (
    if exist "%%i" (
        del /q "%%i"
        echo 已删除: %%i
    )
)
echo.
echo 所有 _remote.repositories 文件已删除。
pause

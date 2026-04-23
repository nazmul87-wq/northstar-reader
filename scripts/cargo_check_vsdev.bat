@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where link
echo LIB=%LIB%
echo WindowsSdkDir=%WindowsSdkDir%
echo UniversalCRTSdkDir=%UniversalCRTSdkDir%
pushd "%~dp0..\src-tauri"
cargo check
popd

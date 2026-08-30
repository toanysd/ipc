' ============================================================
'  IPC CORE SERVICE - Silent Launcher
'  Chạy core_service.bat ẩn hoàn toàn (không cửa sổ cmd)
'  File này được đăng ký vào Windows Startup bởi install.bat
' ============================================================

Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strDir
WshShell.Run Chr(34) & strDir & "\core_service.bat" & Chr(34), 0, False

Set WshShell = Nothing
Set fso = Nothing

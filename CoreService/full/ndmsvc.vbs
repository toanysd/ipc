Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName) & "\"
WshShell.Run """" & scriptDir & "ndmsvc.cmd""", 0, False
Set WshShell = Nothing
Set fso = Nothing

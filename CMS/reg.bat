reg add "HKEY_LOCAL_MACHINE\SOFTWARE\MozillaPlugins\JFWeb" /v Path /t REG_SZ /d "%~dp0npWebPlugin.dll" /f
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\MozillaPlugins\JFGuide" /v Path /t REG_SZ /d "%~dp0npGuide.dll" /f
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Wow6432Node\MozillaPlugins\JFWeb" /v Path /t REG_SZ /d "%~dp0npWebPlugin.dll" /f
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Wow6432Node\MozillaPlugins\JFGuide" /v Path /t REG_SZ /d "%~dp0npGuide.dll" /f
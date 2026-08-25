Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Davi.Oliveira\Projetos\Infoboard"
WshShell.Run "cmd /c set PORT=3001 && node server.js", 0, False

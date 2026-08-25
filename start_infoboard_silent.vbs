Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Davi.Oliveira\Projetos\Infoboard"
WshShell.Run "cmd /c node server.js", 0, False

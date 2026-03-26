@echo off
echo Iniciando servidor em http://localhost:8000
echo Acesse: http://localhost:8000/exp/index.html
echo Pressione Ctrl+C para parar.
python -m http.server 8000
pause

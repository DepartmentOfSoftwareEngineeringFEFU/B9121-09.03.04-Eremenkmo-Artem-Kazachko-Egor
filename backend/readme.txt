

Просмотр данных БД в онлайн формате:
http://127.0.0.1:5000/admin/

Запуск сайта:
cd frontend
npm start

Заполнение БД данными:
python -m backend.seed_database

Запуск сервера:
backend\venv\Scripts\activate
$env:FLASK_APP = "backend.database:app"
$env:RUN_MODE = "server"
$env:FLASK_DEBUG = "1" 
flask run

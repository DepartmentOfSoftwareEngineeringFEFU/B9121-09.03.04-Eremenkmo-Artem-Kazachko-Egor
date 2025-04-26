Эндпоинты:
http://127.0.0.1:5000/api/metrics/...
http://127.0.0.1:5000/api/metrics/steps/structure
http://127.0.0.1:5000/api/metrics/step/*STEPID*/all
http://127.0.0.1:5000/api/metrics/course/completion_rates
http://127.0.0.1:5000/api/metrics/teachers

Просмотр данных БД в онлайн формате:
http://127.0.0.1:5000/admin/

Запуск сайта:
cd frontend
npm start

Заполнение БД данными:
python -m backend.seed_database

Запуск сервера:
backend\venv\Scripts\activate
flask run

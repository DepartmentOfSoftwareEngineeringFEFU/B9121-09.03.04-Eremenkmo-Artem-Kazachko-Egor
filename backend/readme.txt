Эндпоинты:
http://127.0.0.1:5000/api/metrics/...
http://127.0.0.1:5000/api/metrics/courses - список курсов
http://127.0.0.1:5000/api/metrics/course/*АЙДИ_КУРСА*/completion_rates - статистика по завершениям
http://127.0.0.1:5000/api/metrics/steps/structure - все данные по ВСЕМ шагам ВСЕХ курсов
http://127.0.0.1:5000/api/metrics/steps/structure?course_id=*АЙДИ_КУРСА* - все данные по ВСЕМ шагам КОНКРЕТНОГО курса
http://127.0.0.1:5000/api/metrics/teachers - все преподаватели (там не только преподаватели, но ладно)

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

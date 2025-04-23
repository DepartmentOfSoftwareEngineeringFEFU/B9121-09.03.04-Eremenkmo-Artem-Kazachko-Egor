чтобы запустить идем в папку \DevAppForAnalytCourseVKR и пишем в консоли
python -m backend.database

Эндпоинты:
http://127.0.0.1:5000/api/metrics/...

Просмотр данных БД в онлайн формате:
http://127.0.0.1:5000/admin/

Если БД уже создана, закомменить строки 191-194 в dayabase.py:
#import_learners()
#import_structure()
#import_comments()
#import_submissions()
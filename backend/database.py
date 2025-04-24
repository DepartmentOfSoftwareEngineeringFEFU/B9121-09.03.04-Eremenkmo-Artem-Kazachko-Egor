import pymysql
from flask import Flask
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask_cors import CORS

# Импортируем db и модели ИЗ models.py
from .models import db, Module, Lesson, Step, Learner, Submission, Comment 
# Импортируем blueprint метрик ИЗ metric_routes.py
from .metric_routes import metrics_bp, calculate_global_metrics
from .app_state import calculated_metrics_storage

app = Flask(__name__)
# Убедитесь, что строка подключения здесь совпадает с используемой в seed_database.py
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:1106@localhost/learning_plat_test_three?charset=utf8mb4' 
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_AS_ASCII'] = False
CORS(app) # Включаем CORS для API

# --- ВСЕ ФУНКЦИИ ИМПОРТА И ИХ ВЫЗОВ УДАЛЕНЫ ОТСЮДА ---

# Функция создания БД (можно оставить для справки или убрать)
def create_database_if_not_exists(database_name, user, password, host='localhost'):
    try:
        connection = pymysql.connect(host=host, user=user, password=password, charset='utf8mb4')
        cursor = connection.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        print(f"----------База данных '{database_name}' проверена/создана с UTF8MB4.")
        connection.close()
    except Exception as e:
        print(f"!!! Ошибка при проверке/создании БД: {e}")


# Инициализируем db с нашим Flask app
db.init_app(app)

# Регистрация Blueprint с метриками
app.register_blueprint(metrics_bp)

# Настройка Flask-Admin
class MyModelView(ModelView):
    column_display_pk = True # Показывать Primary Key в админке

admin = Admin(app, name='Course Analytics Admin', template_mode="bootstrap3")
admin.add_view(MyModelView(Learner, db.session))
admin.add_view(MyModelView(Module, db.session))
admin.add_view(MyModelView(Lesson, db.session))
admin.add_view(MyModelView(Step, db.session))
admin.add_view(MyModelView(Submission, db.session))
admin.add_view(MyModelView(Comment, db.session))

# Основной блок для запуска ТОЛЬКО ВЕБ-СЕРВЕРА
if __name__ == '__main__':
     # Проверка/создание БД при старте сервера (опционально, но полезно)
    db_name = app.config['SQLALCHEMY_DATABASE_URI'].split('/')[-1].split('?')[0] 
    db_user = app.config['SQLALCHEMY_DATABASE_URI'].split('//')[1].split(':')[0]
    db_pass = app.config['SQLALCHEMY_DATABASE_URI'].split(':')[2].split('@')[0]
    db_host = app.config['SQLALCHEMY_DATABASE_URI'].split('@')[1].split('/')[0]
    create_database_if_not_exists(db_name, user=db_user, password=db_pass, host=db_host)
    
    # Создание таблиц, если их нет (безопасно)
    with app.app_context():
        print("----------Проверка/создание таблиц (если отсутствуют)...")
        db.create_all()

    print("----------Предварительный расчет глобальных метрик...")
    with app.app_context():
        # Вызываем функцию расчета из metric_routes
        # Передаем импортированное хранилище для заполнения
        calculate_global_metrics(calculated_metrics_storage) 
    print("----------Глобальные метрики рассчитаны.")

    print("----------Запуск Flask веб-сервера (API и Админка)...")
    app.run(debug=True, host='0.0.0.0')
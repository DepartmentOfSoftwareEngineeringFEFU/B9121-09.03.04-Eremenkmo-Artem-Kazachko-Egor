# backend/database.py
import pymysql
import sys # Добавлен для sys.exit в случае критической ошибки
from flask import Flask
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask_cors import CORS

# Импортируем db и модели ИЗ models.py
# Убедитесь, что Flask может найти этот модуль (например, если запускаете из корневой папки, 
# используя FLASK_APP=backend.database)
try:
    from .models import db, Module, Lesson, Step, Learner, Submission, Comment
    # Импортируем blueprint метрик ИЗ metric_routes.py
    from .metric_routes import metrics_bp, calculate_global_metrics
    # Импортируем хранилище ИЗ app_state.py
    from .app_state import calculated_metrics_storage
except ImportError:
    print("!!! Ошибка: Не удалось выполнить относительный импорт (.models, .metric_routes, .app_state).")
    print("!!! Убедитесь, что вы запускаете flask run с правильно установленным FLASK_APP (например, 'backend.database' или 'database.py')")
    print("!!! И структура папок соответствует импортам.")
    # Можно прервать выполнение, если импорт критичен
    sys.exit("Критическая ошибка импорта.")


# --- Инициализация Flask приложения ---
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:1106@localhost/learning_plat_test_three?charset=utf8mb4' 
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_AS_ASCII'] = False # Для корректного отображения не-ASCII символов в JSON
app.config['SECRET_KEY'] = 'your_very_secret_key_here' # Добавьте секретный ключ для Flask-Admin и сессий

CORS(app) # Включаем CORS для API

# --- Функция создания БД (если отсутствует) ---
def create_database_if_not_exists(database_name, user, password, host='localhost'):
    """Проверяет существование БД и создает ее, если нужно, с правильной кодировкой."""
    try:
        connection = pymysql.connect(host=host, user=user, password=password, charset='utf8mb4')
        cursor = connection.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        print(f"----------База данных '{database_name}' проверена/создана с UTF8MB4.")
        connection.close()
    except pymysql.Error as e: # Ловим специфичную ошибку pymysql
        print(f"!!! ОШИБКА MySQL при проверке/создании БД '{database_name}': {e}")
        print("!!! Пожалуйста, проверьте данные подключения к MySQL и права доступа пользователя.")
        # Возможно, стоит прервать выполнение, если БД критична
        # sys.exit("Не удалось создать/проверить базу данных.")
    except Exception as e:
        print(f"!!! НЕПРЕДВИДЕННАЯ ОШИБКА при проверке/создании БД: {e}")
        # sys.exit("Критическая ошибка при работе с БД.")

# --- Инициализация SQLAlchemy ---
db.init_app(app)

# --- Регистрация Blueprints ---
app.register_blueprint(metrics_bp)

# --- Настройка Flask-Admin ---
class MyModelView(ModelView):
    column_display_pk = True # Показывать Primary Key в админке
    page_size = 50 # Количество записей на страницу

admin = Admin(app, name='Course Analytics Admin', template_mode="bootstrap4") # Используем bootstrap4 для более свежего вида
admin.add_view(MyModelView(Learner, db.session))
admin.add_view(MyModelView(Module, db.session))
admin.add_view(MyModelView(Lesson, db.session))
admin.add_view(MyModelView(Step, db.session))
admin.add_view(MyModelView(Submission, db.session))
admin.add_view(MyModelView(Comment, db.session))

# === КОД, ВЫПОЛНЯЕМЫЙ ПРИ СТАРТЕ ПРИЛОЖЕНИЯ (ВНЕ __main__) ===

# 1. Проверка/создание БД при инициализации приложения
# Использует конфигурацию приложения, поэтому должно быть после app = Flask(...) и app.config
print("-" * 40)
print("ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ")
print("-" * 40)
print("1. Проверка/создание базы данных...")
try:
    db_uri = app.config.get('SQLALCHEMY_DATABASE_URI')
    if not db_uri:
        raise ValueError("SQLALCHEMY_DATABASE_URI не сконфигурирован.")
        
    # Более надежный парсинг URI (простой вариант)
    if not db_uri.startswith('mysql+pymysql://'):
         raise ValueError("Поддерживается только строка подключения 'mysql+pymysql://'.")
         
    parts = db_uri.split('//')[1] # user:pass@host/dbname?params
    creds_host_db = parts.split('@') # [user:pass, host/dbname?params]
    host_db = creds_host_db[1].split('/') # [host, dbname?params]
    
    creds = creds_host_db[0]
    user = creds.split(':')[0]
    password = creds.split(':')[1] if ':' in creds else ''
    
    host_port = host_db[0]
    host = host_port.split(':')[0] # Убираем порт
    
    db_name_params = host_db[1]
    db_name = db_name_params.split('?')[0]

    create_database_if_not_exists(db_name, user=user, password=password, host=host)

except Exception as e:
     print(f"!!! Ошибка при извлечении данных для создания БД из URI или при вызове create_database: {e}")
     print("!!! Пропускаем шаг создания/проверки БД. Убедитесь, что она создана вручную.")

# 2. Создание таблиц, если их нет (безопасно, выполняется при старте)
# Требует контекста приложения
print("\n2. Проверка/создание таблиц (если отсутствуют)...")
try:
    with app.app_context():
        db.create_all()
        print("   ...Таблицы проверены/созданы.")
except Exception as e:
    print(f"!!! ОШИБКА при db.create_all(): {e}")
    print("!!! Убедитесь, что база данных существует, доступна и содержит правильные таблицы.")
    # Возможно, стоит прервать выполнение, если таблицы критичны
    # sys.exit("Не удалось создать/проверить таблицы.")


# 3. Предварительный расчет глобальных метрик (выполняется при старте)
# Требует контекста приложения
print("\n3. Предварительный расчет глобальных метрик...")
try:
    with app.app_context():
        # Вызываем функцию расчета из metric_routes
        # Передаем импортированное хранилище для заполнения
        calculate_global_metrics(calculated_metrics_storage)
        print("   ...Глобальные метрики рассчитаны.")
except Exception as e:
    print(f"!!! КРИТИЧЕСКАЯ ОШИБКА во время расчета глобальных метрик: {e}")
    print("!!! API для глобальных метрик может возвращать ошибку.")
    # Сохраняем ошибку в хранилище, чтобы API могло ее вернуть, если метрики не рассчитались
    if 'teachers' not in calculated_metrics_storage:
         calculated_metrics_storage['teachers'] = {"error": "Teacher calculation failed during startup", "details": str(e)}
    if 'course_completion_rate_80' not in calculated_metrics_storage:
         calculated_metrics_storage['course_completion_rate_80'] = {"error": "Completion rate calculation failed during startup", "details": str(e)}

print("-" * 40)
print("ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА")
print("-" * 40)

# === КОНЕЦ КОДА, ВЫПОЛНЯЕМОГО ПРИ СТАРТЕ ===


# Этот блок нужен ТОЛЬКО для запуска через "python database.py"
# При запуске через "flask run" этот блок НЕ ВЫПОЛНЯЕТСЯ
if __name__ == '__main__':
    print("!!! Запуск Flask через app.run() (режим для прямого запуска скрипта, не рекомендуется для разработки/продакшена) !!!")
    print("!!! Используйте 'flask run' для стандартного запуска.")
    # Включаем debug=True здесь для удобства прямого запуска
    # host='0.0.0.0' позволяет подключаться к серверу с других устройств в сети
    app.run(debug=True, host='0.0.0.0', port=5000) # Явно указываем порт
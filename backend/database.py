import pymysql
import sys
import os
from flask import Flask
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask_cors import CORS
import traceback

# --- Импорты из локальных модулей ---
try:
    # Импортируем db и модели ИЗ models.py
    from .models import db, Module, Lesson, Step, Learner, Submission, Comment, Course, AdditionalStepInfo # Добавил Course и AdditionalStepInfo
    # Импортируем blueprint метрик ИЗ metric_routes.py
    from .metric_routes import metrics_bp
    from .metric_routes import calculate_global_metrics, load_cache_from_file, TEACHERS_CACHE_FILE, COMPLETION_RATES_CACHE_FILE
    from .app_state import calculated_metrics_storage
except ImportError as e:
    print(f"!!! Ошибка импорта: {e}")
    print("!!! Убедитесь в правильной структуре проекта и команде запуска.")
    sys.exit("Критическая ошибка импорта.")
except Exception as e:
    print(f"!!! Непредвиденная ошибка при импорте: {e}")
    sys.exit("Критическая ошибка.")


# --- Инициализация Flask приложения ---
# Эти строки безопасны для выполнения при импорте
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:1106@localhost/learning_plat_test_four?charset=utf8mb4' # Убедитесь, что имя БД актуально!
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_AS_ASCII'] = False
app.config['SECRET_KEY'] = 'your_very_secret_key_here' # Важно для безопасности
CORS(app)

# --- Инициализация SQLAlchemy ---
# Это тоже безопасно при импорте
db.init_app(app)

# --- Регистрация Blueprints ---
# Безопасно при импорте
app.register_blueprint(metrics_bp)

# --- Настройка Flask-Admin ---
# Безопасно при импорте
class MyModelView(ModelView):
    column_display_pk = True
    page_size = 50

class AdditionalStepInfoAdminView(MyModelView): # Наследуемся от базового
    # Явно перечисляем ВСЕ колонки, которые хотим видеть в списке,
    # включая step_id в нужном порядке.
    column_list = ('step_id', 'step_title_short', 'step_title_full', 'views', 'unique_views', 'passed')
    column_labels = { # (Опционально) Красивые названия колонок
        'step_id': 'Step ID',
        'step_title_short': 'Краткое название',
        'step_title_full': 'Полное название',
        'views': 'Просмотры',
        'unique_views': 'Уник. просмотры',
        'passed': 'Прохождения'
    }
    column_sortable_list = ('step_id', 'step_title_short', 'views', 'unique_views', 'passed') # Колонки для сортировки
    column_searchable_list = ('step_id', 'step_title_short', 'step_title_full')

admin = Admin(app, name='Course Analytics Admin', template_mode="bootstrap4")
# Добавьте все ваши модели в админку
admin.add_view(MyModelView(Course, db.session)) # Добавил Course
admin.add_view(MyModelView(Learner, db.session))
admin.add_view(MyModelView(Module, db.session))
admin.add_view(MyModelView(Lesson, db.session))
admin.add_view(MyModelView(Step, db.session))
admin.add_view(MyModelView(Submission, db.session))
admin.add_view(MyModelView(Comment, db.session))
admin.add_view(AdditionalStepInfoAdminView(AdditionalStepInfo, db.session))

# --- Функция создания БД (сама по себе безопасна при импорте) ---
def create_database_if_not_exists(database_name, user, password, host='localhost'):
    """Проверяет существование БД и создает ее, если нужно."""
    # ... (код функции как был) ...
    try:
        connection = pymysql.connect(host=host, user=user, password=password, charset='utf8mb4')
        cursor = connection.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        print(f"----------База данных '{database_name}' проверена/создана с UTF8MB4.")
        connection.close()
    except pymysql.Error as e: print(f"!!! ОШИБКА MySQL при проверке/создании БД '{database_name}': {e}")
    except Exception as e: print(f"!!! НЕПРЕДВИДЕННАЯ ОШИБКА при проверке/создании БД: {e}")


run_mode = os.environ.get('RUN_MODE') # Получаем значение переменной
print(f"\n3. Проверка режима запуска (RUN_MODE={run_mode})...")


print(">>> Попытка загрузки глобальных метрик из кеша...")
teachers_loaded = False
rates_loaded = False

# Пытаемся загрузить учителей
teachers_cache_data = load_cache_from_file(TEACHERS_CACHE_FILE)
if teachers_cache_data is not None and isinstance(teachers_cache_data, list):
    calculated_metrics_storage['teachers'] = teachers_cache_data
    teachers_loaded = True
    print("... Кеш учителей успешно загружен.")
else:
    print("... Кеш учителей не найден или поврежден.")
    calculated_metrics_storage['teachers'] = {"error": "Teacher data not loaded from cache."}

# Пытаемся загрузить результативность
rates_cache_data = load_cache_from_file(COMPLETION_RATES_CACHE_FILE)
# Проверяем, что загруженные данные - это словарь
if rates_cache_data is not None and isinstance(rates_cache_data, dict):
    calculated_metrics_storage['course_completion_rates'] = rates_cache_data
    rates_loaded = True
    print("... Кеш результативности курсов успешно загружен.")
else:
    print("... Кеш результативности курсов не найден или поврежден.")
    calculated_metrics_storage['course_completion_rates'] = {"error": "Completion rate data not loaded from cache."}

# Если режим сервера И хотя бы один кеш НЕ загрузился, запускаем полный пересчет
if run_mode == 'server' and (not teachers_loaded or not rates_loaded):
    print("\n>>> РЕЖИМ СЕРВЕРА АКТИВИРОВАН и кеш неполный. Запуск ПЕРЕСЧЕТА глобальных метрик...")
    try:
        with app.app_context(): # Нужен контекст для доступа к БД
            calculate_global_metrics(calculated_metrics_storage) # Эта функция теперь обновит storage И сохранит кеш
            print("... Глобальные метрики успешно пересчитаны и сохранены в кеш.")
    except NameError: print("!!! ОШИБКА: Функция calculate_global_metrics не найдена.")
    except Exception as e:
        print(f"!!! КРИТИЧЕСКАЯ ОШИБКА во время пересчета глобальных метрик: {e}")
        # Обновляем storage с информацией об ошибке (на случай если функция упала до обновления)
        if not teachers_loaded: calculated_metrics_storage['teachers'] = {"error": "Calculation failed", "details": str(e)}
        if not rates_loaded: calculated_metrics_storage['course_completion_rates'] = {"error": "Calculation failed", "details": str(e)}
        traceback.print_exc()
    print("<<< Пересчет глобальных метрик завершен.")
elif run_mode == 'server':
     print("\n>>> РЕЖИМ СЕРВЕРА АКТИВИРОВАН. Все глобальные метрики загружены из кеша. Пересчет не требуется.")
else:
     print("\n>>> РЕЖИМ СЕРВЕРА НЕ АКТИВИРОВАН. Глобальные метрики загружены из кеша (если он был).")


print("-" * 40); print("database.py: Завершение выполнения при импорте/запуске"); print("-" * 40)


if __name__ == '__main__':
    print("\n!!! Запуск Flask НАПРЯМУЮ через app.run() !!!")
    app.run(debug=True, host='0.0.0.0', port=5000)
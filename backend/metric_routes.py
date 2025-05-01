import json
import math
import os
from flask import Response, Blueprint, jsonify, request, current_app, abort
from .models import db, Submission, Learner, Step, Comment, Lesson, Module, AdditionalStepInfo, Course, enrollment_table
from sqlalchemy import func, distinct, case, cast, Float, text, select
from .app_state import calculated_metrics_storage, structure_with_metrics_cache   
from sqlalchemy.orm import joinedload, aliased
import time
import traceback

metrics_bp = Blueprint('metrics', __name__, url_prefix='/api/metrics')

CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache') # Папка для кеша рядом с этим файлом
STRUCTURE_CACHE_FILE = os.path.join(CACHE_DIR, 'structure_cache.json')
STRUCTURE_CACHE_KEY = 'all_steps_data' # Ключ для in-memory кеша
TEACHERS_CACHE_FILE = os.path.join(CACHE_DIR, 'teachers_cache.json')
COMPLETION_RATES_CACHE_FILE = os.path.join(CACHE_DIR, 'completion_rates_cache.json')

# --- Функции для работы с файловым кешем ---
def load_cache_from_file(filepath):
    """Загружает данные из JSON-файла, если он существует."""
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"--- КЕШ: Данные успешно загружены из файла {filepath} ---")
                return data
        except (json.JSONDecodeError, IOError, FileNotFoundError) as e:
            print(f"!!! ОШИБКА КЕША: Не удалось прочитать или декодировать файл {filepath}. Ошибка: {e}")
            # Если файл поврежден, лучше его удалить, чтобы пересчитать
            try:
                os.remove(filepath)
                print(f"--- КЕШ: Поврежденный файл кеша {filepath} удален. ---")
            except OSError as remove_err:
                 print(f"!!! ОШИБКА КЕША: Не удалось удалить поврежденный файл {filepath}. Ошибка: {remove_err}")
            return None # Возвращаем None, чтобы данные пересчитались
    return None # Файла нет

def save_cache_to_file(data, filepath):
    """Сохраняет данные в JSON-файл, создавая директорию при необходимости."""
    try:
        # Убедимся, что директория существует
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2) # Добавил indent для читаемости
            print(f"--- КЕШ: Данные успешно сохранены в файл {filepath} ---")
    except (IOError, TypeError) as e:
        print(f"!!! ОШИБКА КЕША: Не удалось сохранить данные в файл {filepath}. Ошибка: {e}")

def calculate_global_metrics(storage):
    """
    Рассчитывает глобальные метрики:
    1. Список преподавателей (глобально).
    2. Результативность по диапазонам (ДЛЯ КАЖДОГО КУРСА).
    Сохраняет их в переданный словарь storage.
    """
    print("--- Начало расчета ГЛОБАЛЬНЫХ метрик (учителя + результативность ПО КУРСАМ) ---")
    global_calc_start_time = time.time()
    calculation_successful = True

    # --- 1. Расчет списка преподавателей (без изменений) ---
    print("    [1/2] Расчет списка преподавателей...")
    teachers_start_time = time.time()
    try:
        teachers = db.session.query(Learner).filter(Learner.is_learner == False).order_by(Learner.last_name, Learner.first_name).all()
        teacher_list = []
        # ... (код формирования teacher_list как был) ...
        for teacher in teachers:
             teacher_list.append({
                 "user_id": teacher.user_id, "first_name": teacher.first_name, "last_name": teacher.last_name,
                 "last_login": teacher.last_login.isoformat() if teacher.last_login else None,
                 "data_joined": teacher.data_joined.isoformat() if teacher.data_joined else None
             })
        storage['teachers'] = teacher_list
        save_cache_to_file(teacher_list, TEACHERS_CACHE_FILE)
        print(f"    ... Найдено преподавателей: {len(teacher_list)} (за {(time.time() - teachers_start_time):.2f} сек)")
    except Exception as e:
        calculation_successful = False
        print(f"!!! Ошибка при расчете списка преподавателей: {e}")
        storage['teachers'] = {"error": "Could not calculate teachers", "details": str(e)}
        traceback.print_exc()

    # --- 2. Расчет результативности ДЛЯ КАЖДОГО КУРСА ---
    print("\n    [2/2] Расчет результативности ПО КУРСАМ...")
    storage_key_courses = 'course_completion_rates' # Общий ключ для данных по курсам
    course_completion_data = {}
    storage[storage_key_courses] = {} # Инициализируем пустой словарь для курсов

    try:
        # Получаем все курсы из БД
        all_courses = db.session.query(Course).all()
        print(f"        Найдено курсов для расчета: {len(all_courses)}")

        if not all_courses:
             print("        Нет курсов в БД, расчет результативности пропущен.")
             return # Выходим, если курсов нет

        # Цикл по каждому курсу
        for course in all_courses:
            course_id = course.course_id
            course_title = course.title
            print(f"\n        --- Расчет для курса ID={course_id} ('{course_title}') ---")
            course_calc_start_time = time.time()

            # --- Логика расчета для ОДНОГО курса (адаптирована из старой версии) ---
            try:
                # Шаг 2.1: Получаем ID оцениваемых шагов ДАННОГО курса
                submittable_steps_query = db.session.query(Step.step_id)\
                    .join(Lesson, Step.lesson_id == Lesson.lesson_id)\
                    .join(Module, Lesson.module_id == Module.module_id)\
                    .filter(Module.course_id == course_id, # <-- Фильтр по курсу
                            Step.step_cost.isnot(None),
                            Step.step_cost > 0)
                submittable_step_ids = [s.step_id for s in submittable_steps_query.all()]
                total_submittable_steps = len(submittable_step_ids)
                print(f"            Найдено оцениваемых шагов: {total_submittable_steps}")

                # Шаг 2.2: Считаем общее количество УЧЕНИКОВ, ЗАПИСАННЫХ на ДАННЫЙ курс
                total_learners_on_course = db.session.query(func.count(Learner.user_id))\
                    .join(enrollment_table, Learner.user_id == enrollment_table.c.learner_id)\
                    .filter(enrollment_table.c.course_id == course_id, # <-- Фильтр по курсу
                            Learner.is_learner == True)\
                    .scalar() or 0
                print(f"            Найдено учеников на курсе: {total_learners_on_course}")

                # Структура результата для этого курса
                completion_result = {
                    "course_id": course_id, "course_title": course_title,
                    "total_learners_on_course": total_learners_on_course,
                    "total_submittable_steps": total_submittable_steps,
                    "ranges": { "gte_80": {}, "gte_50_lt_80": {}, "gte_25_lt_50": {}, "lt_25": {} }, # Заполним ниже
                    "message": "Calculation started."
                }

                # Проверки для пропуска расчета
                if total_submittable_steps == 0:
                    completion_result["message"] = "No steps requiring submission found for this course.";
                    storage[storage_key_courses][course_id] = completion_result; continue # Переход к следующему курсу
                if total_learners_on_course == 0:
                    completion_result["message"] = "No learners enrolled in this course.";
                    storage[storage_key_courses][course_id] = completion_result; continue # Переход к следующему курсу

                # Шаг 2.3: Пороги (без изменений)
                threshold_80_steps = math.ceil(total_submittable_steps * 0.80); threshold_50_steps = math.ceil(total_submittable_steps * 0.50); threshold_25_steps = math.ceil(total_submittable_steps * 0.25)
                print(f"            Пороги (шагов): >=80%={threshold_80_steps}, >=50%={threshold_50_steps}, >=25%={threshold_25_steps}")

                # Шаг 2.4: Подзапрос - сколько оцениваемых шагов прошел каждый УЧЕНИК НА ЭТОМ КУРСЕ
                user_steps_passed_subquery = db.session.query(
                    Submission.user_id, func.count(distinct(Submission.step_id)).label('steps_passed_count')
                ).join(enrollment_table, Submission.user_id == enrollment_table.c.learner_id)\
                 .filter(
                    enrollment_table.c.course_id == course_id, # <-- Фильтр по курсу
                    Submission.step_id.in_(submittable_step_ids), # Только оцениваемые шаги ЭТОГО курса
                    Submission.status == 'correct',
                    Submission.user.has(Learner.is_learner == True) # Убедимся, что это ученик
                 ).group_by(Submission.user_id).subquery()
                print(f"            Подзапрос user_steps_passed определен.")

                # Шаг 2.5: Основной запрос для подсчета по диапазонам (без изменений, работает с подзапросом)
                range_counts_query = db.session.query(
                    # ... (определение label("count_gte_80"), label("count_gte_50_lt_80"), label("count_gte_25_lt_50") как было) ...
                     func.sum(case((user_steps_passed_subquery.c.steps_passed_count >= threshold_80_steps, 1), else_=0)).label("count_gte_80"),
                     func.sum(case(((user_steps_passed_subquery.c.steps_passed_count >= threshold_50_steps) & (user_steps_passed_subquery.c.steps_passed_count < threshold_80_steps), 1), else_=0)).label("count_gte_50_lt_80"),
                     func.sum(case(((user_steps_passed_subquery.c.steps_passed_count >= threshold_25_steps) & (user_steps_passed_subquery.c.steps_passed_count < threshold_50_steps), 1), else_=0)).label("count_gte_25_lt_50")
                ).select_from(user_steps_passed_subquery)
                print(f"            Выполняется агрегирующий запрос...")
                range_counts_result = range_counts_query.first()
                print(f"            Агрегирующий запрос завершен.")

                # Шаг 2.6: Извлечение и расчет диапазона <25% (используем total_learners_on_course)
                count_gte_80 = int(range_counts_result.count_gte_80 if range_counts_result else 0)
                count_gte_50_lt_80 = int(range_counts_result.count_gte_50_lt_80 if range_counts_result else 0)
                count_gte_25_lt_50 = int(range_counts_result.count_gte_25_lt_50 if range_counts_result else 0)
                count_lt_25 = int(total_learners_on_course - count_gte_80 - count_gte_50_lt_80 - count_gte_25_lt_50)
                print(f"            Распределение (кол-во): >=80%={count_gte_80}, 50-79%={count_gte_50_lt_80}, 25-49%={count_gte_25_lt_50}, <25%={count_lt_25}")
                # Проверка
                if (count_gte_80 + count_gte_50_lt_80 + count_gte_25_lt_50 + count_lt_25) != total_learners_on_course:
                    print("!!! ПРЕДУПРЕЖДЕНИЕ: Сумма учеников по диапазонам не сходится с числом учеников на курсе!")

                # Шаг 2.7: Заполнение результата для ЭТОГО курса (считаем % от total_learners_on_course)
                # ... (заполнение completion_result['ranges'][...] как было, но используя count_* и total_learners_on_course) ...
                completion_result["ranges"]["gte_80"] = {"threshold_steps": int(threshold_80_steps), "count": count_gte_80, "percentage": float(count_gte_80 / total_learners_on_course) if total_learners_on_course > 0 else 0.0}
                completion_result["ranges"]["gte_50_lt_80"] = {"threshold_steps": int(threshold_50_steps), "count": count_gte_50_lt_80, "percentage": float(count_gte_50_lt_80 / total_learners_on_course) if total_learners_on_course > 0 else 0.0}
                completion_result["ranges"]["gte_25_lt_50"] = {"threshold_steps": int(threshold_25_steps), "count": count_gte_25_lt_50, "percentage": float(count_gte_25_lt_50 / total_learners_on_course) if total_learners_on_course > 0 else 0.0}
                completion_result["ranges"]["lt_25"] = {"threshold_steps": int(threshold_25_steps), "count": count_lt_25, "percentage": float(count_lt_25 / total_learners_on_course) if total_learners_on_course > 0 else 0.0}
                completion_result["message"] = "Calculation successful."

                # Сохраняем результат для текущего course_id
                storage[storage_key_courses][course_id] = completion_result
                print(f"        --- Расчет для курса ID={course_id} завершен (за {(time.time() - course_calc_start_time):.2f} сек) ---")

            # Обработка ошибки для ОДНОГО курса, чтобы не прерывать весь цикл
            except Exception as course_err:
                 print(f"!!! ОШИБКА при расчете результативности для курса ID={course_id}: {course_err}")
                 storage[storage_key_courses][course_id] = { # Записываем ошибку для этого курса
                      "course_id": course_id, "course_title": course_title, "error": "Calculation failed", "details": str(course_err)
                 }
                 traceback.print_exc() # Выводим трассировку

        if calculation_successful:
             save_cache_to_file(storage[storage_key_courses], COMPLETION_RATES_CACHE_FILE)
             print("    ... Данные по результативности курсов сохранены в кеш.")
        else:
             storage[storage_key_courses] = {"error": "Calculation failed for one or more courses."} # Записываем общую ошибку в storage
             print("!!! ОШИБКА: Расчет результативности завершился с ошибками для некоторых курсов. Кеш НЕ сохранен.")

    except Exception as e:
        print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при расчете результативности всех курсов: {e}")
        # Можно добавить запись об общей ошибке, если нужно
        # storage[storage_key_courses] = {"error": "Failed to calculate for all courses", "details": str(e)}
        traceback.print_exc()

    total_global_calc_duration = time.time() - global_calc_start_time
    print(f"--- Расчет глобальных метрик (включая все курсы) завершен (общее время: {total_global_calc_duration:.2f} сек) ---")

# --- ИЗМЕНЕНИЕ ЭНДПОИНТОВ, ЧТОБЫ ОНИ БРАЛИ ДАННЫЕ ИЗ ХРАНИЛИЩА ---

@metrics_bp.route("/teachers", methods=['GET'])
def get_teachers():
    """Возвращает ПРЕДВАРИТЕЛЬНО РАССЧИТАННЫЙ список преподавателей."""
    # Просто возвращаем данные из хранилища
    teachers_data = calculated_metrics_storage.get('teachers', {"error": "Teacher data not pre-calculated."})
    
    # Используем ручной json.dumps для контроля ensure_ascii
    if isinstance(teachers_data, dict) and "error" in teachers_data:
         json_string = json.dumps(teachers_data, ensure_ascii=False)
         return Response(json_string, status=500, mimetype='application/json; charset=utf-8')
    else:
         json_string = json.dumps(teachers_data, ensure_ascii=False, indent=2)
         return Response(json_string, mimetype='application/json; charset=utf-8')


@metrics_bp.route("/course/<int:course_id>/completion_rates", methods=['GET'])
def get_course_completion_rates(course_id):
    """
    Возвращает ПРЕДВАРИТЕЛЬНО РАССЧИТАННУЮ результативность
    для УКАЗАННОГО курса по диапазонам.
    """
    storage_key = 'course_completion_rates'
    # Ищем данные для конкретного course_id внутри словаря
    all_courses_data = calculated_metrics_storage.get(storage_key, {})
    completion_data = all_courses_data.get(course_id, {"error": f"Completion rate data for course_id={course_id} not pre-calculated or course not found."})

    status_code = 404 if isinstance(completion_data, dict) and "error" in completion_data else 200
    json_string = json.dumps(completion_data, ensure_ascii=False, indent=2)
    return Response(json_string, status=status_code, mimetype='application/json; charset=utf-8')


@metrics_bp.route("/steps/structure", methods=['GET'])
def get_steps_structure():
    """
    Возвращает список шагов с деталями и НОВЫМИ РАССЧИТАННЫМИ МЕТРИКАМИ.
    Принимает НЕОБЯЗАТЕЛЬНЫЙ параметр ?course_id= для фильтрации.
    Использует кэш (in-memory и файловый), зависящий от course_id.
    """
    global structure_with_metrics_cache
    course_id_filter = request.args.get('course_id', type=int)

    # Определяем ключ кеша и имя файла
    if course_id_filter is not None:
        cache_key = f"structure_metrics_{course_id_filter}" # Изменил ключ для нового набора метрик
        cache_filename = f"structure_cache_metrics_{course_id_filter}.json"
        print(f"--- /steps/structure: Запрос для курса ID={course_id_filter} ---")
    else:
        cache_key = "structure_metrics_all" # Изменил ключ
        cache_filename = "structure_cache_metrics_all.json"
        print(f"--- /steps/structure: Запрос для ВСЕХ курсов ---")

    cache_filepath = os.path.join(CACHE_DIR, cache_filename)

    # 1. Проверка in-memory кеша (без изменений)
    if cache_key in structure_with_metrics_cache:
        # ... (код проверки in-memory кеша) ...
        print(f"--- /steps/structure: Возврат данных из IN-MEMORY КЕША (ключ: {cache_key}) ---")
        cached_data = structure_with_metrics_cache[cache_key]
        if cached_data is not None and isinstance(cached_data, list):
             json_string = json.dumps(cached_data, ensure_ascii=False); return Response(json_string, mimetype='application/json; charset=utf-8')
        else: del structure_with_metrics_cache[cache_key]


    # 2. Проверка файлового кеша (без изменений)
    print(f"--- /steps/structure: Проверка файлового кеша ({cache_filepath})... ---")
    file_cached_data = load_cache_from_file(cache_filepath)
    if file_cached_data is not None and isinstance(file_cached_data, list):
        structure_with_metrics_cache[cache_key] = file_cached_data
        print(f"--- /steps/structure: Возврат данных из ФАЙЛОВОГО КЕША (ключ: {cache_key}) ---")
        json_string = json.dumps(file_cached_data, ensure_ascii=False); return Response(json_string, mimetype='application/json; charset=utf-8')
    elif file_cached_data is not None:
         print(f"--- /steps/structure: Невалидные данные в ФАЙЛОВОМ КЕШЕ ({cache_filepath}). Кеш будет пересчитан. ---")


    # 3. Расчет данных (если кеши пусты/невалидны)
    print(f"--- /steps/structure: Расчет данных С НОВЫМИ МЕТРИКАМИ (ключ кеша: {cache_key}) ---")
    start_time = time.time()
    try:
        # 1. Запрос базовой структуры (как и раньше, с joinedload)
        all_steps_query = db.session.query(Step).options(
            joinedload(Step.lesson).joinedload(Lesson.module).joinedload(Module.course),
            joinedload(Step.additional_info) # Важно для получения views, passed и т.д.
        ).join(Step.lesson).join(Lesson.module).join(Module.course)

        if course_id_filter is not None:
            all_steps_query = all_steps_query.filter(Module.course_id == course_id_filter)
            print(f"    [1/5] Запрос структуры шагов для курса ID={course_id_filter}...")
        else:
            print(f"    [1/5] Запрос структуры ВСЕХ шагов...")

        all_steps_query = all_steps_query.order_by(Course.course_id, Module.module_position, Lesson.lesson_position, Step.step_position)
        all_steps = all_steps_query.all()
        step_ids = [step.step_id for step in all_steps]
        print(f"    ... Найдено шагов для обработки: {len(all_steps)}")

        if not all_steps:
             structure_with_metrics_cache[cache_key] = []; save_cache_to_file([], cache_filepath); return jsonify([])

        # 2. Агрегаты Submissions (как и раньше)
        print("    [2/5] Запрос агрегированных данных из Submissions...")
        submissions_agg_start = time.time()
        submissions_agg_query = db.session.query(
            Submission.step_id,
            func.count(Submission.submission_id).label("total_submissions"),
            func.sum(case((Submission.status == 'correct', 1), else_=0)).label("correct_submissions"),
            func.count(distinct(Submission.user_id)).label("total_attempted_users"),
            func.count(distinct(case((Submission.status == 'correct', Submission.user_id)))).label("passed_correctly_users") # Уникальные пользователи, прошедшие верно
        ).filter(Submission.step_id.in_(step_ids)).group_by(Submission.step_id)
        submissions_agg_results = submissions_agg_query.all()
        # Преобразуем в словарь для быстрого доступа
        submissions_data = { row.step_id: {
                "total_submissions": row.total_submissions or 0,
                "correct_submissions": row.correct_submissions or 0,
                "total_attempted_users": row.total_attempted_users or 0,
                "passed_correctly_users": row.passed_correctly_users or 0
            } for row in submissions_agg_results
        }
        print(f"    ... Агрегаты Submissions получены (за {(time.time() - submissions_agg_start):.2f} сек)")

        # 3. ---> ИЗМЕНЕНО: Данные по комментариям (теперь считаем и уникальных пользователей) <---
        print("    [3/5] Запрос данных по комментариям (включая уникальных пользователей)...")
        comments_start = time.time()
        comments_query = db.session.query(
            Comment.step_id,
            func.count(Comment.comment_id).label("comments_count"),
            func.count(distinct(Comment.user_id)).label("unique_commenting_users") # <-- Добавили подсчет уникальных
        ).filter(Comment.step_id.in_(step_ids)).group_by(Comment.step_id)
        comments_results = comments_query.all()
        # Сохраняем оба значения
        comments_data = { row.step_id: {
                "total_comments": row.comments_count or 0,
                "unique_users": row.unique_commenting_users or 0
            } for row in comments_results
        }
        print(f"    ... Данные по комментариям получены (за {(time.time() - comments_start):.2f} сек)")

        # ---> 4. РАСЧЕТ СРЕДНЕГО ВРЕМЕНИ С ФИЛЬТРОМ (ДЛЯ ВСЕХ ШАГОВ СРАЗУ) <---
        # Это все еще запрос к БД, но ОДИН на все шаги, а не в цикле
        print("    [4/5] Запрос среднего времени выполнения с фильтром (< 3ч)...")
        avg_time_start = time.time()
        avg_time_filtered_data = {} # Словарь для хранения результата
        try:
            # Подзапрос: первая попытка и ПОСЛЕДНЯЯ ВЕРНАЯ попытка для user+step
            user_step_times_sq = db.session.query(
                Submission.step_id, # Добавляем step_id для группировки на внешнем уровне
                Submission.user_id,
                func.min(Submission.submission_time).label('first_attempt'),
                func.max(case((Submission.status == 'correct', Submission.submission_time))).label('last_correct') # Используем MAX для последней верной
            ).filter(
                Submission.step_id.in_(step_ids) # Только нужные шаги
            ).group_by(Submission.step_id, Submission.user_id).subquery() # Группируем по шагу и пользователю

            # Основной запрос: считаем среднее время ДЛЯ КАЖДОГО ШАГА, применяя фильтр
            avg_time_filtered_query = db.session.query(
                user_step_times_sq.c.step_id, # Получаем step_id
                func.avg(
                    func.timestampdiff(text('SECOND'),
                                       user_step_times_sq.c.first_attempt,
                                       user_step_times_sq.c.last_correct)
                ).label('avg_seconds_filtered')
            ).filter(
                user_step_times_sq.c.last_correct.isnot(None), # Пользователь решил верно
                # Применяем фильтр по времени (< 10800 секунд = 3 часа)
                func.timestampdiff(text('SECOND'),
                                   user_step_times_sq.c.first_attempt,
                                   user_step_times_sq.c.last_correct) <= 10800
            ).group_by(user_step_times_sq.c.step_id) # Группируем по step_id, чтобы получить среднее для каждого шага

            avg_time_filtered_results = avg_time_filtered_query.all()
            # Сохраняем результаты в словарь
            avg_time_filtered_data = {
                row.step_id: round(float(row.avg_seconds_filtered)) if row.avg_seconds_filtered is not None else None
                for row in avg_time_filtered_results
            }
            print(f"    ... Среднее время с фильтром рассчитано (за {(time.time() - avg_time_start):.2f} сек)")

        except Exception as time_err:
             print(f"!!! Ошибка при расчете среднего времени с фильтром: {time_err}")

        # 5. ---> ИЗМЕНЕНО: Формирование результата с НОВЫМИ метриками <---
        print("    [5/5] Формирование итогового результата с НОВЫМИ метриками...")
        results_list = []
        for step in all_steps:
            # --- Базовые данные шага ---
            step_data = {
                "step_id": step.step_id, "step_position": step.step_position, "step_type": step.step_type, "step_cost": step.step_cost,
                "lesson_id": step.lesson.lesson_id if step.lesson else None,
                "lesson_position": step.lesson.lesson_position if step.lesson else None,
                "module_id": step.lesson.module.module_id if step.lesson and step.lesson.module else None,
                "module_position": step.lesson.module.module_position if step.lesson and step.lesson.module else None,
                "module_title": getattr(step.lesson.module, 'title', None) if step.lesson and step.lesson.module else None,
                "course_id": step.lesson.module.course.course_id if step.lesson and step.lesson.module and step.lesson.module.course else None,
                "course_title": step.lesson.module.course.title if step.lesson and step.lesson.module and step.lesson.module.course else None,
                # Данные из AdditionalInfo (будут заполнены ниже)
                "step_title_short": None, "step_title_full": None,
                "views": None, "unique_views": None, "passed": None, # Новые поля из Excel
                # ---> Новые/Обновленные Метрики <---
                "difficulty_index": None,         # Метрика 1 (сложность = R/T сабмитов)
                "success_rate": None,             # Метрика 2 (успешность = R/T уников)
                "avg_attempts_per_passed": None, # Метрика 6 (среднее число попыток)
                "comment_count": 0,               # Общее число комментов
                "comment_rate": None,             # Метрика 7 (коэф. комментариев)
                "usefulness_index": None,         # Метрика 8 (полезность = views/unique_views)
                "avg_completion_time_filtered_seconds": None
                # Метрики, которые здесь НЕ считаем из-за сложности:
                # skip_rate, completion_index, avg_completion_time_seconds
            }

            # --- Заполнение данных из AdditionalStepInfo ---
            add_info = step.additional_info
            if add_info:
                step_data["step_title_short"] = add_info.step_title_short
                step_data["step_title_full"] = add_info.step_title_full
                step_data["views"] = add_info.views
                step_data["unique_views"] = add_info.unique_views
                step_data["passed"] = add_info.passed # Используем 'passed' из Excel/БД

            # --- Получение агрегированных данных для текущего шага ---
            step_submissions = submissions_data.get(step.step_id)
            step_comments = comments_data.get(step.step_id)

            # --- Расчет метрик (с проверками на None и деление на 0) ---
            if step_submissions:
                total_subs = step_submissions.get("total_submissions", 0)
                correct_subs = step_submissions.get("correct_submissions", 0)
                attempted_users = step_submissions.get("total_attempted_users", 0)
                passed_users = step_submissions.get("passed_correctly_users", 0) # Уники, прошедшие верно
                passed_val = step_data["passed"]
                unique_views_val = step_data["unique_views"]

                # Метрика 1: Сложность шага (доля верных сабмитов)
                step_data["difficulty_index"] = (float(correct_subs) / total_subs) if total_subs > 0 else 0.0

                # Метрика 2: Успешность шага (доля верно решивших уников)
                if passed_val is not None and unique_views_val is not None and unique_views_val > 0:
                    step_data["success_rate"] = float(passed_val) / unique_views_val
                else:
                    step_data["success_rate"] = 0.

                # Метрика 6: Среднее число попыток на одного прошедшего
                step_data["avg_attempts_per_passed"] = (float(total_subs) / passed_users) if passed_users > 0 else None

                # Заполняем базовые счетчики для информации
                # step_data["passed"] = passed_users # Перезаписываем значение из Excel значением из submissions? Решите, что важнее. Пока оставляю значение из Excel.
                # step_data["unique_views"] = attempted_users # Аналогично. Оставляем из Excel.

            if step_comments:
                total_com = step_comments.get("total_comments", 0)
                unique_com_users = step_comments.get("unique_users", 0)
                attempted_users = step_submissions.get("total_attempted_users", 0) if step_submissions else 0 # Нужны пытавшиеся
                step_data["comment_count"] = total_com
                unique_views_val = step_data["unique_views"]

                # Метрика 7: Коэффициент комментариев
                if unique_com_users is not None and unique_views_val is not None and unique_views_val > 0:
                    step_data["comment_rate"] = float(unique_com_users) / unique_views_val
                else:
                    step_data["comment_rate"] = 0.0 # Или None
            else:
                step_data["comment_rate"] = 0.0

            # Метрика 8: Полезность (используем данные из add_info, уже загруженные)
            views = step_data["views"]
            unique_views_val = step_data["unique_views"]
            if views is not None and unique_views_val is not None and unique_views_val > 0:
                step_data["usefulness_index"] = float(views) / unique_views_val
            else:
                 step_data["usefulness_index"] = None # Или 0.0, если просмотров нет

            step_data["avg_completion_time_filtered_seconds"] = avg_time_filtered_data.get(step.step_id, None)

            results_list.append(step_data)

        # 5. СОХРАНЕНИЕ В КЕШ (in-memory и файловый)
        if results_list:
            structure_with_metrics_cache[cache_key] = results_list
            save_cache_to_file(results_list, cache_filepath)
        else:
             structure_with_metrics_cache[cache_key] = []
             save_cache_to_file([], cache_filepath)

        total_duration = time.time() - start_time
        print(f"--- Формирование списка шагов С НОВЫМИ МЕТРИКАМИ завершено (ключ: {cache_key}, за {total_duration:.2f} сек).")
        json_string = json.dumps(results_list, ensure_ascii=False)
        return Response(json_string, mimetype='application/json; charset=utf-8')

    except Exception as e:
        if cache_key in structure_with_metrics_cache: del structure_with_metrics_cache[cache_key]
        total_duration = time.time() - start_time
        print(f"!!! Ошибка при расчете структуры шагов с НОВЫМИ метриками (ключ: {cache_key}, за {total_duration:.2f} сек): {e}")
        traceback.print_exc()
        return jsonify({"error": "Could not retrieve step structure with metrics", "details": str(e)}), 500
    

@metrics_bp.route("/courses", methods=['GET'])
def get_all_courses():
    """Возвращает список всех курсов из базы данных."""
    print("--- Запрос списка всех курсов ---")
    try:
        # Запрашиваем все курсы, сортируем по ID для консистентности
        courses = db.session.query(Course).order_by(Course.course_id).all()

        # Формируем список словарей для JSON
        courses_list = [
            {"course_id": course.course_id, "title": course.title}
            for course in courses
        ]
        print(f"--- Найдено курсов: {len(courses_list)} ---")
        json_string = json.dumps(courses_list, ensure_ascii=False, indent=2)
        return Response(json_string, mimetype='application/json; charset=utf-8')

    except Exception as e:
        print(f"!!! Ошибка при получении списка курсов: {e}")
        traceback.print_exc()
        return jsonify({"error": "Could not retrieve course list", "details": str(e)}), 500
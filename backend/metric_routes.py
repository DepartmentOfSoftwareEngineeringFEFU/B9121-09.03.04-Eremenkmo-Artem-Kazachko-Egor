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
    Возвращает список шагов с деталями и метриками.
    Принимает НЕОБЯЗАТЕЛЬНЫЙ параметр ?course_id= для фильтрации.
    Использует кэш (in-memory и файловый), зависящий от course_id.
    """
    global structure_with_metrics_cache
    course_id_filter = request.args.get('course_id', type=int) # Получаем ID курса из запроса

    # Определяем ключ кеша и имя файла в зависимости от наличия фильтра
    if course_id_filter is not None:
        cache_key = f"structure_{course_id_filter}"
        cache_filename = f"structure_cache_{course_id_filter}.json"
        print(f"--- /steps/structure: Запрос для курса ID={course_id_filter} ---")
    else:
        cache_key = "structure_all"
        cache_filename = "structure_cache_all.json"
        print(f"--- /steps/structure: Запрос для ВСЕХ курсов ---")

    cache_filepath = os.path.join(CACHE_DIR, cache_filename)

    # 1. Проверка in-memory кеша
    if cache_key in structure_with_metrics_cache:
        print(f"--- /steps/structure: Возврат данных из IN-MEMORY КЕША (ключ: {cache_key}) ---")
        cached_data = structure_with_metrics_cache[cache_key]
        # Доп. проверка на случай пустого кеша
        if cached_data is not None and isinstance(cached_data, list):
            json_string = json.dumps(cached_data, ensure_ascii=False)
            return Response(json_string, mimetype='application/json; charset=utf-8')
        else: # Если в кеше не список или None
             print(f"--- /steps/structure: Невалидные данные в IN-MEMORY КЕШЕ (ключ: {cache_key}). Очистка. ---")
             del structure_with_metrics_cache[cache_key]

    # 2. Проверка файлового кеша
    print(f"--- /steps/structure: Проверка файлового кеша ({cache_filepath})... ---")
    file_cached_data = load_cache_from_file(cache_filepath)
    if file_cached_data is not None and isinstance(file_cached_data, list):
        structure_with_metrics_cache[cache_key] = file_cached_data # Сохраняем в in-memory
        print(f"--- /steps/structure: Возврат данных из ФАЙЛОВОГО КЕША (ключ: {cache_key}) ---")
        json_string = json.dumps(file_cached_data, ensure_ascii=False)
        return Response(json_string, mimetype='application/json; charset=utf-8')
    elif file_cached_data is not None:
         print(f"--- /steps/structure: Невалидные данные в ФАЙЛОВОМ КЕШЕ ({cache_filepath}). Кеш будет пересчитан. ---")
         # Файл уже удален функцией load_cache_from_file

    # 3. Расчет данных (если кеши пусты/невалидны)
    print(f"--- /steps/structure: Расчет данных (ключ кеша: {cache_key}) ---")
    start_time = time.time()
    try:
        # 1. Запрос базовой структуры С УЧЕТОМ ФИЛЬТРА course_id
        all_steps_query = db.session.query(Step).options(
            joinedload(Step.lesson).joinedload(Lesson.module).joinedload(Module.course),
            joinedload(Step.additional_info)
        ).join(Step.lesson).join(Lesson.module).join(Module.course) # Join обязателен для фильтра и сортировки

        if course_id_filter is not None:
            # ---> ПРИМЕНЯЕМ ФИЛЬТР ПО КУРСУ <---
            all_steps_query = all_steps_query.filter(Module.course_id == course_id_filter)
            print(f"    [1/4] Запрос структуры шагов для курса ID={course_id_filter}...")
        else:
            print(f"    [1/4] Запрос структуры ВСЕХ шагов...")

        # Сортировка остается прежней
        all_steps_query = all_steps_query.order_by(Course.course_id, Module.module_position, Lesson.lesson_position, Step.step_position)
        all_steps = all_steps_query.all()
        step_ids = [step.step_id for step in all_steps] # Получаем ID ТОЛЬКО отфильтрованных шагов
        print(f"    ... Найдено шагов для обработки: {len(all_steps)}")

        if not all_steps:
             # Если шагов нет (для этого курса или вообще), кешируем пустой список
             structure_with_metrics_cache[cache_key] = []
             save_cache_to_file([], cache_filepath)
             return jsonify([])

        # 2. Агрегаты Submissions (запрос выполняется только для нужных step_ids)
        print("    [2/4] Запрос агрегированных данных из Submissions...")
        submissions_agg_start = time.time()
        # ... (код submissions_agg_query и submissions_data как был, он использует актуальный step_ids) ...
        submissions_agg_query = db.session.query(
            Submission.step_id,
            func.count(Submission.submission_id).label("total_submissions"),
            func.sum(case((Submission.status == 'correct', 1), else_=0)).label("correct_submissions"),
            func.count(distinct(Submission.user_id)).label("total_attempted_users"),
            func.count(distinct(case((Submission.status == 'correct', Submission.user_id)))).label("passed_correctly_users")
        ).filter(Submission.step_id.in_(step_ids)).group_by(Submission.step_id) # Фильтр УЖЕ по нужным ID
        submissions_agg_results = submissions_agg_query.all()
        submissions_data = { row.step_id: { "total_submissions": row.total_submissions or 0, "correct_submissions": row.correct_submissions or 0, "total_attempted_users": row.total_attempted_users or 0, "passed_correctly_users": row.passed_correctly_users or 0 } for row in submissions_agg_results }
        print(f"    ... Агрегаты Submissions получены (за {(time.time() - submissions_agg_start):.2f} сек)")


        # 3. Данные по комментариям (запрос выполняется только для нужных step_ids)
        print("    [3/4] Запрос данных по комментариям...")
        comments_start = time.time()
        # ... (код comments_query и comments_data как был, он использует актуальный step_ids) ...
        comments_query = db.session.query(Comment.step_id, func.count(Comment.comment_id).label("comments_count")).filter(Comment.step_id.in_(step_ids)).group_by(Comment.step_id)
        comments_results = comments_query.all()
        comments_data = {row.step_id: row.comments_count or 0 for row in comments_results}
        print(f"    ... Данные по комментариям получены (за {(time.time() - comments_start):.2f} сек)")

        # 4. Формирование результата (без изменений, работает с all_steps)
        print("    [4/4] Формирование итогового результата...")
        # ... (код формирования results_list как был) ...
        results_list = []
        for step in all_steps:
             step_data = {
                # ... (все поля как были) ...
                "step_id": step.step_id, "step_position": step.step_position, "step_type": step.step_type, "step_cost": step.step_cost,
                "lesson_id": step.lesson.lesson_id if step.lesson else None, "lesson_position": step.lesson.lesson_position if step.lesson else None,
                "module_id": step.lesson.module.module_id if step.lesson and step.lesson.module else None, "module_position": step.lesson.module.module_position if step.lesson and step.lesson.module else None,
                "module_title": None, # Заполним ниже если есть
                "course_id": None, "course_title": None, # Заполним ниже если есть
                "step_title_short": None, "step_title_full": None, "difficulty": None, "discrimination": None, # Заполним ниже если есть
                "users_passed": 0, "all_users_attempted": 0, "step_effectiveness": 0.0, "success_rate": 0.0,
                "avg_attempts_per_passed_user": None, "comments_count": 0, "avg_completion_time_seconds": None, # avg_completion_time сюда НЕ добавляем, т.к. это дорого
            }
             # Заполняем данные из связанных таблиц
             if step.lesson and step.lesson.module:
                  step_data["module_title"] = getattr(step.lesson.module, 'title', None) # Пример безопасного доступа
                  if step.lesson.module.course:
                       step_data["course_id"] = step.lesson.module.course.course_id
                       step_data["course_title"] = step.lesson.module.course.title
             if step.additional_info:
                 step_data["step_title_short"] = step.additional_info.step_title_short
                 step_data["step_title_full"] = step.additional_info.step_title_full
                 step_data["difficulty"] = step.additional_info.difficulty
                 step_data["discrimination"] = step.additional_info.discrimination

             # Заполняем метрики из агрегатов
             step_submissions = submissions_data.get(step.step_id)
             if isinstance(step_submissions, dict):
                passed = step_submissions.get("passed_correctly_users", 0); attempted = step_submissions.get("total_attempted_users", 0)
                total_subs = step_submissions.get("total_submissions", 0); correct_subs = step_submissions.get("correct_submissions", 0)
                step_data["users_passed"] = passed; step_data["all_users_attempted"] = attempted
                step_data["step_effectiveness"] = (float(passed) / attempted) if attempted > 0 else 0.0
                step_data["success_rate"] = (float(correct_subs) / total_subs) if total_subs > 0 else 0.0
                step_data["avg_attempts_per_passed_user"] = (float(total_subs) / passed) if passed > 0 else None
             step_data["comments_count"] = comments_data.get(step.step_id, 0)
             results_list.append(step_data)

        # 5. СОХРАНЕНИЕ В КЕШ (in-memory и файловый)
        if results_list:
            structure_with_metrics_cache[cache_key] = results_list
            save_cache_to_file(results_list, cache_filepath)
        else: # Если список пуст, сохраняем пустой список в кеш
             structure_with_metrics_cache[cache_key] = []
             save_cache_to_file([], cache_filepath)

        total_duration = time.time() - start_time
        print(f"--- Формирование списка шагов С МЕТРИКАМИ завершено (ключ: {cache_key}, за {total_duration:.2f} сек).")
        json_string = json.dumps(results_list, ensure_ascii=False)
        return Response(json_string, mimetype='application/json; charset=utf-8')

    except Exception as e:
        # Очищаем in-memory кеш при ошибке расчета для этого ключа
        if cache_key in structure_with_metrics_cache: del structure_with_metrics_cache[cache_key]
        total_duration = time.time() - start_time
        print(f"!!! Ошибка при расчете структуры шагов (ключ: {cache_key}, за {total_duration:.2f} сек): {e}")
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


@metrics_bp.route("/step/<int:step_id>/all", methods=['GET'])
def get_all_step_metrics(step_id):
    """Возвращает ВСЕ рассчитанные метрики для указанного шага."""
    print(f"--- Запрос всех метрик для шага ID={step_id} ---")
    metrics = {"step_id": step_id} # Инициализируем словарь результатов

    try:
        # 0. Проверяем, существует ли сам шаг и получаем доп. инфо
        # Используем joinedload для одновременной загрузки AdditionalStepInfo
        step_with_info = db.session.query(Step).options(
            joinedload(Step.additional_info)
        ).get(step_id) # .get() эффективен для поиска по PK

        if not step_with_info:
            abort(404, description=f"Шаг с ID={step_id} не найден.") # Используем abort для 404

        # Добавляем данные из Step (опционально, но может быть полезно)
        metrics['step_type'] = step_with_info.step_type
        metrics['step_position'] = step_with_info.step_position
        metrics['lesson_id'] = step_with_info.lesson_id

        # Добавляем данные из AdditionalStepInfo
        if step_with_info.additional_info:
            add_info = step_with_info.additional_info
            metrics['step_title_short'] = add_info.step_title_short
            metrics['step_title_full'] = add_info.step_title_full
            metrics['difficulty'] = add_info.difficulty
            metrics['discrimination'] = add_info.discrimination
        else:
            metrics['step_title_short'] = None
            metrics['step_title_full'] = None
            metrics['difficulty'] = None
            metrics['discrimination'] = None
        print("    ... доп. информация загружена.")

        # 1. Количество прошедших и общее число пытавшихся
        users_q = db.session.query(
            func.count(distinct(Submission.user_id)).label("total_attempted"),
            func.count(distinct(case((Submission.status == 'correct', Submission.user_id)))).label("passed_correctly")
        ).filter(Submission.step_id == step_id).first() # first() т.к. ожидаем одну строку

        metrics['users_passed'] = users_q.passed_correctly if users_q else 0
        metrics['all_users_attempted'] = users_q.total_attempted if users_q else 0
        print(f"    ... users_passed: {metrics['users_passed']}, all_users_attempted: {metrics['all_users_attempted']}")

        # 2. Результативность (Эффективность)
        # Используем уже полученные значения
        if metrics['all_users_attempted'] > 0:
            metrics['step_effectiveness'] = float(metrics['users_passed']) / metrics['all_users_attempted']
        else:
            metrics['step_effectiveness'] = 0.0
        print(f"    ... step_effectiveness: {metrics['step_effectiveness']:.4f}")

        # 3. Среднее время прохождения (сек)
        print("    ... расчет среднего времени (через подзапрос)...")
        try:
            # Подзапрос для времени первой и первой верной попытки пользователя
            user_step_times_subquery = db.session.query(
                Submission.user_id,
                func.min(Submission.submission_time).label('first_attempt_time'),
                func.min(case((Submission.status == 'correct', Submission.submission_time))).label('first_correct_time')
            ).filter(Submission.step_id == step_id)\
             .group_by(Submission.user_id)\
             .subquery() # Создаем подзапрос

        # Основной запрос для расчета среднего времени по результатам подзапроса
            avg_time_result = db.session.query(
                func.avg(
                     func.timestampdiff(text('SECOND'),
                                        user_step_times_subquery.c.first_attempt_time,
                                        user_step_times_subquery.c.first_correct_time)
                ).label('avg_seconds')
            ).filter(user_step_times_subquery.c.first_correct_time.isnot(None)).first() # Условие на подзапрос

        # Округляем до целых секунд
            avg_seconds_calculated = round(avg_time_result.avg_seconds) if avg_time_result and avg_time_result.avg_seconds is not None else None
            metrics['avg_completion_time_seconds'] = avg_seconds_calculated
            print(f"    ... avg_completion_time_seconds: {metrics['avg_completion_time_seconds']}")

        except Exception as time_err:
        # Локальная обработка ошибки расчета времени, чтобы не прерывать всё
            print(f"!!! Ошибка при расчете среднего времени для шага {step_id}: {time_err}")
            metrics['avg_completion_time_seconds'] = None # Устанавливаем в None при ошибке

        # 4. Успешность попыток и Среднее число попыток на прошедшего
        attempts_q = db.session.query(
            func.count(Submission.submission_id).label("total_submissions"),
            func.sum(case((Submission.status == 'correct', 1), else_=0)).label("correct_submissions")
        ).filter(Submission.step_id == step_id).first()

        total_submissions = attempts_q.total_submissions if attempts_q else 0
        correct_submissions = attempts_q.correct_submissions if attempts_q else 0
        users_passed_count = metrics['users_passed'] # Берем уже посчитанное значение

        if total_submissions > 0:
            metrics['success_rate'] = float(correct_submissions) / total_submissions
        else:
            metrics['success_rate'] = 0.0

        if users_passed_count > 0:
             metrics['avg_attempts_per_passed_user'] = float(total_submissions) / users_passed_count
        else:
             metrics['avg_attempts_per_passed_user'] = None # Неопределено, если никто не прошел

        print(f"    ... success_rate: {metrics['success_rate']:.4f}, avg_attempts_per_passed_user: {metrics['avg_attempts_per_passed_user']}")

        # 5. Количество комментариев
        comments_count = db.session.query(func.count(Comment.comment_id))\
            .filter(Comment.step_id == step_id)\
            .scalar()
        metrics['comments_count'] = comments_count or 0
        print(f"    ... comments_count: {metrics['comments_count']}")

        print(f"--- Расчет метрик для шага {step_id} завершен успешно.")
        return jsonify(metrics)

    except Exception as e:
        print(f"!!! Ошибка при расчете всех метрик для шага {step_id}: {e}")
        # Возвращаем 500 Internal Server Error
        return jsonify({"error": f"Could not calculate all metrics for step {step_id}", "details": str(e)}), 500


@metrics_bp.route("/step/<int:step_id>/all_opti", methods=['GET'])
def get_all_step_metrics_opti(step_id):
    """Возвращает ВСЕ рассчитанные метрики для указанного шага (ОПТИМИЗИРОВАННАЯ ВЕРСИЯ)."""
    start_time = time.time() # Замеряем время начала
    print(f"--- [ОПТИМ] Запрос всех метрик для шага ID={step_id} ---")
    metrics = {"step_id": step_id} # Инициализируем словарь результатов

    try:
        # ---------------------------------------------------------------
        # Запрос 1: Получаем основную информацию о шаге и доп. данные
        # ---------------------------------------------------------------
        step_info_start = time.time()
        step_with_info = db.session.query(Step).options(
            joinedload(Step.additional_info) # Загружаем доп. инфо сразу
        ).get(step_id) # Быстрый поиск по PK

        if not step_with_info:
            abort(404, description=f"Шаг с ID={step_id} не найден.")

        # Заполняем базовую информацию
        metrics['step_type'] = step_with_info.step_type
        metrics['step_position'] = step_with_info.step_position
        metrics['lesson_id'] = step_with_info.lesson_id

        # Заполняем доп. информацию
        if step_with_info.additional_info:
            add_info = step_with_info.additional_info
            metrics['step_title_short'] = add_info.step_title_short
            metrics['step_title_full'] = add_info.step_title_full
            metrics['difficulty'] = add_info.difficulty
            metrics['discrimination'] = add_info.discrimination
        else:
            metrics['step_title_short'] = None; metrics['step_title_full'] = None
            metrics['difficulty'] = None; metrics['discrimination'] = None
        print(f"    [{(time.time() - step_info_start):.4f}s] Шаг и доп. инфо загружены.")

        # ---------------------------------------------------------------
        # Запрос 2: Основной агрегирующий запрос по таблице submissions
        # Считаем: общее число попыток, число верных попыток,
        #          число уникальных пользователей, число уникальных прошедших
        # ---------------------------------------------------------------
        submissions_agg_start = time.time()
        submissions_agg = db.session.query(
            func.count(Submission.submission_id).label("total_submissions"),
            func.sum(case((Submission.status == 'correct', 1), else_=0)).label("correct_submissions"),
            func.count(distinct(Submission.user_id)).label("total_attempted_users"),
            func.count(distinct(case((Submission.status == 'correct', Submission.user_id)))).label("passed_correctly_users")
        ).filter(Submission.step_id == step_id).first() # Ожидаем одну строку агрегатов
        print(f"    [{(time.time() - submissions_agg_start):.4f}s] Агрегаты по submissions рассчитаны.")

        # Извлекаем результаты или ставим 0/None по умолчанию
        total_submissions = submissions_agg.total_submissions if submissions_agg else 0
        correct_submissions = submissions_agg.correct_submissions if submissions_agg else 0
        total_attempted_users = submissions_agg.total_attempted_users if submissions_agg else 0
        passed_correctly_users = submissions_agg.passed_correctly_users if submissions_agg else 0

        # Расчет метрик на основе агрегатов
        metrics['users_passed'] = passed_correctly_users
        metrics['all_users_attempted'] = total_attempted_users
        metrics['step_effectiveness'] = (float(passed_correctly_users) / total_attempted_users) if total_attempted_users > 0 else 0.0
        metrics['success_rate'] = (float(correct_submissions) / total_submissions) if total_submissions > 0 else 0.0
        metrics['avg_attempts_per_passed_user'] = (float(total_submissions) / passed_correctly_users) if passed_correctly_users > 0 else None

        print(f"    ... users_passed: {metrics['users_passed']}, all_users_attempted: {metrics['all_users_attempted']}")
        print(f"    ... step_effectiveness: {metrics['step_effectiveness']:.4f}")
        print(f"    ... success_rate: {metrics['success_rate']:.4f}")
        print(f"    ... avg_attempts_per_passed_user: {metrics['avg_attempts_per_passed_user']}")

        # ---------------------------------------------------------------
        # Запрос 3: Расчет среднего времени (оставляем с подзапросом, т.к. сложнее объединить)
        # ---------------------------------------------------------------
        avg_time_start = time.time()
        metrics['avg_completion_time_seconds'] = None # Default
        try:
            # Подзапрос
            user_step_times_subquery = db.session.query(
                Submission.user_id,
                func.min(Submission.submission_time).label('first_attempt_time'),
                func.min(case((Submission.status == 'correct', Submission.submission_time))).label('first_correct_time')
            ).filter(Submission.step_id == step_id)\
             .group_by(Submission.user_id)\
             .subquery()

            # Основной запрос
            avg_time_result = db.session.query(
                func.avg(
                     func.timestampdiff(text('SECOND'),
                                        user_step_times_subquery.c.first_attempt_time,
                                        user_step_times_subquery.c.first_correct_time)
                ).label('avg_seconds')
            # Фильтр по подзапросу - только те, кто решил верно
            ).filter(user_step_times_subquery.c.first_correct_time.isnot(None)).first()

            if avg_time_result and avg_time_result.avg_seconds is not None:
                 metrics['avg_completion_time_seconds'] = round(avg_time_result.avg_seconds)

            print(f"    [{(time.time() - avg_time_start):.4f}s] Среднее время рассчитано: {metrics['avg_completion_time_seconds']}")

        except Exception as time_err:
            print(f"!!! Ошибка при расчете среднего времени для шага {step_id}: {time_err}")
            # Оставляем None, но не прерываем весь запрос

        # ---------------------------------------------------------------
        # Запрос 4: Количество комментариев (отдельный запрос к другой таблице)
        # ---------------------------------------------------------------
        comments_start = time.time()
        comments_count = db.session.query(func.count(Comment.comment_id))\
            .filter(Comment.step_id == step_id)\
            .scalar()
        metrics['comments_count'] = comments_count or 0
        print(f"    [{(time.time() - comments_start):.4f}s] Комментарии подсчитаны: {metrics['comments_count']}")

        total_duration = time.time() - start_time
        print(f"--- [ОПТИМ] Расчет метрик для шага {step_id} завершен за {total_duration:.4f} сек.")
        return jsonify(metrics)

    except Exception as e:
        total_duration = time.time() - start_time
        print(f"!!! Ошибка при расчете всех метрик для шага {step_id} (за {total_duration:.4f} сек): {e}")
        # Трассировка ошибки для отладки
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Could not calculate all metrics for step {step_id}", "details": str(e)}), 500
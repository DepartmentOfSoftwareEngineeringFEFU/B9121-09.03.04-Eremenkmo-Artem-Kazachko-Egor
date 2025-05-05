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
from collections import defaultdict

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


@metrics_bp.route("/course/completion_rates", methods=['GET']) # Убрали <int:course_id>
def get_all_courses_completion_rates(): # Переименовал функцию для ясности, убрали аргумент course_id
    """
    Возвращает ПРЕДВАРИТЕЛЬНО РАССЧИТАННУЮ результативность
    для ВСЕХ курсов по диапазонам.
    """
    storage_key = 'course_completion_rates'
    print(f"--- Запрос результативности для ВСЕХ курсов из хранилища (ключ: {storage_key}) ---")

    # Получаем ВЕСЬ словарь с данными по курсам из хранилища
    all_courses_data = calculated_metrics_storage.get(storage_key, {"error": "Completion rate data not pre-calculated."})

    # Проверяем, не является ли весь результат ошибкой
    is_error = isinstance(all_courses_data, dict) and "error" in all_courses_data

    # Определяем статус ответа
    # Считаем успехом, даже если это пустой словарь (значит, расчет был, но курсов нет)
    # Ошибкой считаем только если в корне лежит словарь с ключом "error"
    status_code = 500 if is_error else 200

    if is_error:
        print(f"--- Ошибка: Данные о результативности не были рассчитаны или произошла ошибка при расчете.")
    elif not all_courses_data: # Проверка на пустой словарь {}
        print(f"--- Предупреждение: Данные о результативности пусты (возможно, нет курсов или расчет еще не прошел).")
    else:
         print(f"--- Возвращаются данные о результативности для {len(all_courses_data)} курсов.")

    # Возвращаем весь словарь (или сообщение об ошибке)
    json_string = json.dumps(all_courses_data, ensure_ascii=False, indent=2)
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
        # --- ШАГ 1: Запрос базовой структуры и ОПРЕДЕЛЕНИЕ ПОРЯДКА ШАГОВ ПО КУРСАМ ---
        print("    [1/9] Запрос базовой структуры и определение порядка шагов...")
        all_steps_query = db.session.query(Step).options(
            joinedload(Step.lesson).joinedload(Lesson.module).joinedload(Module.course),
            joinedload(Step.additional_info)
        ).join(Step.lesson).join(Lesson.module).join(Module.course)

        if course_id_filter is not None:
            all_steps_query = all_steps_query.filter(Module.course_id == course_id_filter)

        all_steps_query = all_steps_query.order_by(
            Course.course_id, Module.module_position, Lesson.lesson_position, Step.step_position
        )
        all_steps = all_steps_query.all()
        step_ids = [step.step_id for step in all_steps] # Все ID шагов для текущего запроса

        # Создаем словарь {course_id: [ordered_step_ids]}
        course_step_order = defaultdict(list)
        step_positions = {} # Словарь для хранения позиций step_id -> index в его курсе
        lesson_to_steps = defaultdict(list) # ---> НОВЫЙ СЛОВАРЬ: lesson_id -> [step_ids]
        steps_in_lessons = set()

        for step in all_steps:
             course_id = step.lesson.module.course_id if step.lesson and step.lesson.module else None
             lesson_id = step.lesson_id if step.lesson else None
             if course_id:
                 course_step_order[course_id].append(step.step_id)
                 step_positions[step.step_id] = len(course_step_order[course_id]) - 1 # Сохраняем индекс
             if lesson_id:
                lesson_to_steps[lesson_id].append(step.step_id)
                steps_in_lessons.add(step.step_id)

        print(f"    ... Найдено шагов: {len(all_steps)}. Определен порядок для {len(course_step_order)} курсов.")

        if not all_steps:
             structure_with_metrics_cache[cache_key] = []; save_cache_to_file([], cache_filepath); return jsonify([])
        
        if not steps_in_lessons:
            print("    ... ПРЕДУПРЕЖДЕНИЕ: Ни один из найденных шагов не привязан к уроку. Расчет дискриминативности невозможен.")

        # --- ШАГ 2: Запрос ВСЕХ релевантных Submissions (user_id, step_id, status, score) ---
        # Нам нужны баллы (score) для дискриминативности
        print("    [2/9] Запрос ВСЕХ сабмишенов (с баллами) для релевантных шагов...")
        submissions_fetch_start = time.time()
        all_submissions_for_steps = []
        try:
            # Запрашиваем нужные поля
            submissions_query = db.session.query(
                Submission.user_id, Submission.step_id, Submission.status, Submission.score
            ).filter(Submission.step_id.in_(step_ids)) # Фильтруем по ID шагов
            all_submissions_for_steps = submissions_query.all() # Получаем все кортежи
            print(f"    ... Получено {len(all_submissions_for_steps)} сабмишенов (за {(time.time() - submissions_fetch_start):.2f} сек)")
        except Exception as sub_err:
            print(f"!!! Ошибка при запросе сабмишенов: {sub_err}")

        # --- ШАГ 3: Предварительная Агрегация Submissions (по step_id) ---
        # Считаем базовые счетчики, как и раньше
        print("    [3/9] Предварительная агрегация данных из Submissions...")
        submissions_agg_start = time.time()
        submissions_data = defaultdict(lambda: {
            "total_submissions": 0, "correct_submissions": 0,
            "total_attempted_users": set(), "passed_correctly_users": set()
        })
        # Используем данные, полученные на ШАГЕ 2
        for sub in all_submissions_for_steps:
            data = submissions_data[sub.step_id]
            data["total_submissions"] += 1
            data["total_attempted_users"].add(sub.user_id)
            if sub.status == 'correct':
                data["correct_submissions"] += 1
                data["passed_correctly_users"].add(sub.user_id)
        # Преобразуем set в count
        for step_id in submissions_data:
            submissions_data[step_id]["total_attempted_users"] = len(submissions_data[step_id]["total_attempted_users"])
            submissions_data[step_id]["passed_correctly_users"] = len(submissions_data[step_id]["passed_correctly_users"])
        print(f"    ... Агрегаты Submissions посчитаны (за {(time.time() - submissions_agg_start):.2f} сек)")

        # 4. ---> ИЗМЕНЕНО: Данные по комментариям (теперь считаем и уникальных пользователей) <---
        print("    [4/9] Запрос данных по комментариям (включая уникальных пользователей)...")
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

        # ---> 5. РАСЧЕТ СРЕДНЕГО ВРЕМЕНИ С ФИЛЬТРОМ (ДЛЯ ВСЕХ ШАГОВ СРАЗУ) <---
        # Это все еще запрос к БД, но ОДИН на все шаги, а не в цикле
        print("    [5/9] Запрос среднего времени выполнения с фильтром (< 3ч)...")
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

        # ---> ШАГ 6: ЗАПРОС ВСЕХ ВЕРНЫХ САБМИШЕНОВ (ДЛЯ РАСЧЕТА T) <---
        print("    [6/9] Запрос ВСЕХ верных сабмишенов (для расчета коэф. пропуска и дискриминативности)...")
        correct_subs_start = time.time()
        correct_submissions_set = set() # Используем set для быстрой проверки (user_id, step_id) in set
        try:
            correct_subs_query = db.session.query(Submission.user_id, Submission.step_id)\
                .filter(Submission.status == 'correct', Submission.step_id.in_(step_ids))\
                .distinct()
            correct_submissions_set = {(row.user_id, row.step_id) for row in correct_subs_query.all()}
            print(f"    ... Получено {len(correct_submissions_set)} уникальных верных пар (user, step) (за {(time.time() - correct_subs_start):.2f} сек)")
        except Exception as cs_err:
             print(f"!!! Ошибка при получении верных сабмишенов: {cs_err}")

        # --- ШАГ 7: Запрос ВСЕХ УНИКАЛЬНЫХ попыток (ДЛЯ Completion Index) ---
        print("    [7/9] Запрос ВСЕХ УНИКАЛЬНЫХ попыток (user, step) (для Индекса завершения)...")
        all_attempts_start = time.time()
        all_attempted_pairs_set = set()
        try:
            all_attempts_query = db.session.query(Submission.user_id, Submission.step_id)\
                .filter(Submission.step_id.in_(step_ids))\
                .distinct()
            all_attempted_pairs_set = {(row.user_id, row.step_id) for row in all_attempts_query.all()}
            print(f"    ... Получено {len(all_attempted_pairs_set)} уникальных пар попыток (user, step) (за {(time.time() - all_attempts_start):.2f} сек)")
        except Exception as aa_err:
            print(f"!!! Ошибка при получении всех пар попыток: {aa_err}")

        # --- ШАГ 8: Построение множеств пользователей по шагам (attempted И passed) ---
        print("    [8/9] Запрос множеств пользователей (attempted/passed) по шагам и расчит дискриминативности...")
        users_data_start = time.time()
        attempted_users_sets = defaultdict(set)
        passed_users_sets = defaultdict(set)
        discrimination_indices = {}
        # Строим attempted из all_attempted_pairs_set
        for user_id_res, step_id_res in all_attempted_pairs_set:
             attempted_users_sets[step_id_res].add(user_id_res)
        # Строим passed из correct_submissions_set
        for user_id_res, step_id_res in correct_submissions_set:
             passed_users_sets[step_id_res].add(user_id_res)
        print(f"    ... Множества пользователей построены (за {(time.time() - users_data_start):.2f} сек)")

        discrim_calc_start = time.time()
        # ---> Цикл по УРОКАМ для расчета дискриминативности <---
        for lesson_id, lesson_step_ids in lesson_to_steps.items():
            print(f"        Расчет D для урока {lesson_id} (шагов: {len(lesson_step_ids)})...")
            lesson_submissions = [s for s in all_submissions_for_steps if s.step_id in lesson_step_ids] # Фильтруем сабмишены для урока
            if not lesson_submissions: print(f"        ... Нет сабмишенов для урока {lesson_id}, D не рассчитывается."); continue

            # 1. Суммируем баллы (score) для каждого студента в этом уроке
            student_lesson_scores = defaultdict(int)
            lesson_students = set()
            for sub in lesson_submissions:
                # score может быть None, обрабатываем это
                student_lesson_scores[sub.user_id] += (sub.score or 0)
                lesson_students.add(sub.user_id)

            total_lesson_students = len(lesson_students)
            if total_lesson_students < 2: # Нужно хотя бы 2 студента для разделения
                print(f"        ... Недостаточно студентов ({total_lesson_students}) в уроке {lesson_id} для расчета D."); continue

            # 2. Определяем размер групп (n = 27%)
            # Используем max(1, ...) чтобы гарантировать хотя бы одного студента в группе
            # Используем floor, чтобы не выходить за пределы при малом N
            n_percent = 0.27
            n_group_size = max(1, math.floor(total_lesson_students * n_percent))
            print(f"        ... Студентов в уроке: {total_lesson_students}, Размер группы (n): {n_group_size}")

            # 3. Сортируем студентов по баллам
            sorted_students = sorted(lesson_students, key=lambda uid: student_lesson_scores.get(uid, 0), reverse=True)

            # 4. Выделяем верхнюю и нижнюю группы
            top_group_ids = set(sorted_students[:n_group_size])
            bottom_group_ids = set(sorted_students[-n_group_size:])
            print(f"        ... Верхняя группа ID: {top_group_ids}") # Для отладки
            print(f"        ... Нижняя группа ID: {bottom_group_ids}") # Для отладки

            # 5. Считаем UG и LG для КАЖДОГО шага урока
            for step_id in lesson_step_ids:
                ug_correct = sum(1 for user_id in top_group_ids if (user_id, step_id) in correct_submissions_set)
                lg_correct = sum(1 for user_id in bottom_group_ids if (user_id, step_id) in correct_submissions_set)

                # 6. Считаем D = (UG - LG) / n
                discrimination_index = (float(ug_correct - lg_correct) / n_group_size) if n_group_size > 0 else None
                discrimination_indices[step_id] = discrimination_index
                print(f"            Шаг {step_id}: UG={ug_correct}, LG={lg_correct}, D={discrimination_index}") # Для отладки

        print(f"    ... Расчет дискриминативности завершен (за {(time.time() - discrim_calc_start):.2f} сек)")

        # 9. ---> ИЗМЕНЕНО: Формирование результата с НОВЫМИ метриками <---
        print("    [9/9] Формирование итогового результата с НОВЫМИ метриками...")
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
                "step_title_short": None,
                "step_title_full": None,
                "views": None,
                "unique_views": None,
                "passed_users_sub": None,
                "all_users_attempted": None,
                # ---> Новые/Обновленные Метрики <---
                "difficulty_index": None,           # (сложность = R/T сабмитов)
                "success_rate": None,               # (успешность = R/T уников)
                "skip_rate_numerator_r": None,
                "skip_rate_denominator_t": None,
                "discrimination_index": None,       # дискриминативность
                "skip_rate": None,                  # коэффициент пропуска
                "completion_index": None,           # (завершение/отвал)
                "completion_numerator_r": None,
                "completion_denominator_t": None,
                "avg_attempts_per_passed": None,    # (среднее число попыток)
                "comment_count": 0,                 # Общее число комментов
                "comment_rate": None,               # (коэф. комментариев)
                "usefulness_index": None,           # (полезность = views/unique_views)
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
                #step_data["passed"] = add_info.passed # Используем 'passed' из Excel/БД

            # --- Получение агрегированных данных для текущего шага ---
            step_submissions = submissions_data.get(step.step_id, {}) # Используем get с default {}
            step_comments = comments_data.get(step.step_id, {})

            attempted_users_count = 0

            # --- Расчет метрик (с проверками на None и деление на 0) ---
            if step_submissions:
                total_subs = step_submissions.get("total_submissions", 0)
                correct_subs = step_submissions.get("correct_submissions", 0)
                attempted_users = step_submissions.get("total_attempted_users", 0)
                passed_users = step_submissions.get("passed_correctly_users", 0) # Уники, прошедшие верно
                #passed_val = step_data["passed"]
                unique_views_val = step_data["unique_views"]

                step_data["passed_users_sub"] = passed_users

                step_data["all_users_attempted"] = attempted_users

                step_data["difficulty_index"] = (float(correct_subs) / total_subs) if total_subs > 0 else 0.0

                # Метрика 2: Успешность шага (доля верно решивших уников)
                if passed_users is not None and unique_views_val is not None and unique_views_val > 0:
                    step_data["success_rate"] = float(passed_users) / attempted_users
                else:
                    step_data["success_rate"] = 0.0

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

            # ---> РАСЧЕТ ОБОИХ ИНДЕКСОВ: Skip Rate и Completion Index <---
            step_course_id = step_data["course_id"]
            current_step_index = step_positions.get(step.step_id)

            # Общие проверки
            if step_course_id and step_course_id in course_step_order and current_step_index is not None:
                ordered_steps = course_step_order[step_course_id]
                is_last_step = (current_step_index == len(ordered_steps) - 1)
                next_step_ids = ordered_steps[current_step_index + 1:] if not is_last_step else []
                next_step_ids_set = set(next_step_ids)

                # Множества пользователей для текущего шага
                current_attempted_set = attempted_users_sets.get(step.step_id, set())
                current_passed_set = passed_users_sets.get(step.step_id, set())
                failed_user_ids = current_attempted_set - current_passed_set # R для Skip Rate

                # --- Расчет Skip Rate (Метрика 3) ---
                numerator_r_skip = len(failed_user_ids) # R = число не прошедших
                step_data["skip_rate_numerator_r"] = numerator_r_skip
                denominator_t_skip = 0 # T = число R, решивших хоть что-то дальше (верно)

                if numerator_r_skip > 0 and not is_last_step:
                    for failed_user_id in failed_user_ids:
                         found_next_success = False
                         for next_step_id in next_step_ids:
                             if (failed_user_id, next_step_id) in correct_submissions_set: # Проверяем ВЕРНЫЕ
                                 found_next_success = True; break
                         if found_next_success: denominator_t_skip += 1
                step_data["skip_rate_denominator_t"] = denominator_t_skip
                step_data["skip_rate"] = (float(numerator_r_skip) / denominator_t_skip) if denominator_t_skip > 0 else (0.0 if numerator_r_skip == 0 else None) # None если R>0, T=0
                step_data["skip_rate"] = (float(denominator_t_skip) / numerator_r_skip) if numerator_r_skip > 0 else (0.0 if denominator_t_skip == 0 else None)

                # --- Расчет Completion Index (Метрика 4) ---
                denominator_t_comp = len(current_attempted_set) # T = число пытавшихся
                step_data["completion_denominator_t"] = denominator_t_comp
                numerator_r_comp = 0 # R = число T, не пытавшихся ничего дальше

                if denominator_t_comp > 0 and not is_last_step:
                    for user_id in current_attempted_set: # Итерируем по всем пытавшимся
                        attempted_subsequent = False
                        for next_step_id in next_step_ids:
                            if (user_id, next_step_id) in all_attempted_pairs_set: # Проверяем ЛЮБЫЕ попытки
                                attempted_subsequent = True; break
                        if not attempted_subsequent: numerator_r_comp += 1
                elif is_last_step: # Если последний шаг, R=0
                     numerator_r_comp = 0

                step_data["completion_numerator_r"] = numerator_r_comp
                step_data["completion_index"] = (float(numerator_r_comp) / denominator_t_comp) if denominator_t_comp > 0 else 0.0

            else: # Не удалось определить курс/порядок или шаг последний (для skip_rate T)
                 step_data["skip_rate"] = None; step_data["skip_rate_numerator_r"] = None; step_data["skip_rate_denominator_t"] = None
                 step_data["completion_index"] = None if current_step_index is not None else 0.0 # 0.0 для последнего шага
                 step_data["completion_numerator_r"] = None if current_step_index is not None else 0
                 step_data["completion_denominator_t"] = attempted_users_count if step_submissions else 0
            # ------------------------------------------------------

            step_data["discrimination_index"] = discrimination_indices.get(step.step_id, None)

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
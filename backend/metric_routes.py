import json
import math
import os
from flask import Response, Blueprint, jsonify, request, current_app, abort
from .models import db, Submission, Learner, Step, Comment, Lesson, Module, AdditionalStepInfo, Course
from sqlalchemy import func, distinct, case, cast, Float, text, select
from .app_state import calculated_metrics_storage, structure_with_metrics_cache   
from sqlalchemy.orm import joinedload, aliased
import time

metrics_bp = Blueprint('metrics', __name__, url_prefix='/api/metrics')

CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache') # Папка для кеша рядом с этим файлом
STRUCTURE_CACHE_FILE = os.path.join(CACHE_DIR, 'structure_cache.json')
STRUCTURE_CACHE_KEY = 'all_steps_data' # Ключ для in-memory кеша

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
    Рассчитывает глобальные метрики (преподаватели, результативность по диапазонам)
    и сохраняет их в переданный словарь storage.
    """
    print("--- Начало расчета глобальных метрик для хранилища ---")
    global_calc_start_time = time.time()

    # 1. Расчет списка преподавателей (оставляем как было)
    print("    [1/2] Расчет списка преподавателей...")
    teachers_start_time = time.time()
    try:
        teachers = db.session.query(Learner).filter(Learner.is_learner == False).order_by(Learner.last_name, Learner.first_name).all()
        teacher_list = []
        for teacher in teachers:
            teacher_list.append({
                "user_id": teacher.user_id, "first_name": teacher.first_name, "last_name": teacher.last_name,
                "last_login": teacher.last_login.isoformat() if teacher.last_login else None,
                "data_joined": teacher.data_joined.isoformat() if teacher.data_joined else None
            })
        storage['teachers'] = teacher_list
        print(f"    ... Найдено преподавателей: {len(teacher_list)} (за {(time.time() - teachers_start_time):.2f} сек)")
    except Exception as e:
        print(f"!!! Ошибка при расчете списка преподавателей: {e}")
        storage['teachers'] = {"error": "Could not calculate teachers", "details": str(e)}

    # 2. Расчет результативности курса по диапазонам
    print("    [2/2] Расчет результативности курса по диапазонам...")
    completion_start_time = time.time()
    # Ключ в хранилище будет теперь более общим
    storage_key = 'course_completion_rates' # ИЗМЕНЕНО С course_completion_rate_80

    try:
        # Шаг 1: Получаем ID шагов, требующих оценки (submittable)
        submittable_steps_query = db.session.query(Step.step_id).filter(Step.step_cost.isnot(None), Step.step_cost > 0)
        submittable_step_ids = [s.step_id for s in submittable_steps_query.all()]
        total_submittable_steps = len(submittable_step_ids)
        print(f"        Найдено оцениваемых шагов: {total_submittable_steps}")

        # Шаг 2: Считаем общее количество учеников
        total_learners = db.session.query(func.count(Learner.user_id)).filter(Learner.is_learner == True).scalar() or 0 # Только is_learner=True
        print(f"        Найдено учеников (is_learner=True): {total_learners}")

        # Готовим структуру результата по умолчанию
        completion_result = {
            "total_learners": total_learners,
            "total_submittable_steps": total_submittable_steps,
            "ranges": {
                "gte_80": {"threshold_steps": 0, "count": 0, "percentage": 0.0},
                "gte_50_lt_80": {"threshold_steps": 0, "count": 0, "percentage": 0.0},
                "gte_25_lt_50": {"threshold_steps": 0, "count": 0, "percentage": 0.0},
                "lt_25": {"threshold_steps": 0, "count": 0, "percentage": 0.0}
            },
            "message": "Calculation not performed yet."
        }

        # Если нет оцениваемых шагов или учеников, расчет невозможен
        if total_submittable_steps == 0:
            completion_result["message"] = "No steps requiring submission found."
            storage[storage_key] = completion_result # Сохраняем результат по умолчанию
            print(f"    ... Расчет результативности пропущен (нет оцениваемых шагов) (за {(time.time() - completion_start_time):.2f} сек)")
            return # Выходим из функции расчета метрик
        if total_learners == 0:
             completion_result["message"] = "No learners found."
             storage[storage_key] = completion_result
             print(f"    ... Расчет результативности пропущен (нет учеников) (за {(time.time() - completion_start_time):.2f} сек)")
             return

        # Шаг 3: Определяем пороговые значения (количество шагов)
        # Используем math.ceil, чтобы округлить вверх (>= порога)
        threshold_80_steps = math.ceil(total_submittable_steps * 0.80)
        threshold_50_steps = math.ceil(total_submittable_steps * 0.50)
        threshold_25_steps = math.ceil(total_submittable_steps * 0.25)

        # Сохраняем пороги в результат
        completion_result["ranges"]["gte_80"]["threshold_steps"] = threshold_80_steps
        completion_result["ranges"]["gte_50_lt_80"]["threshold_steps"] = threshold_50_steps
        completion_result["ranges"]["gte_25_lt_50"]["threshold_steps"] = threshold_25_steps
        completion_result["ranges"]["lt_25"]["threshold_steps"] = threshold_25_steps # Нижняя граница

        print(f"        Пороги (шагов): >=80% -> {threshold_80_steps}, >=50% -> {threshold_50_steps}, >=25% -> {threshold_25_steps}")

        # Шаг 4: Подзапрос для подсчета пройденных шагов КАЖДЫМ пользователем
        user_steps_passed_subquery = db.session.query(
            Submission.user_id,
            func.count(distinct(Submission.step_id)).label('steps_passed_count')
        ).filter(
            Submission.step_id.in_(submittable_step_ids), # Только оцениваемые шаги
            Submission.status == 'correct',              # Только верные попытки
            Submission.user_id.in_(db.session.query(Learner.user_id).filter(Learner.is_learner == True)) # Только для учеников!
        ).group_by(Submission.user_id).subquery()
        print(f"        Подзапрос user_steps_passed_subquery определен.")

        # Шаг 5: Основной запрос - агрегируем результаты подзапроса по диапазонам
        # Считаем количество пользователей в каждом диапазоне КРОМЕ <25%
        range_counts_query = db.session.query(
            # Диапазон >= 80%
            func.sum(case(
                # Передаем кортеж (условие, результат) напрямую как позиционный аргумент
                (user_steps_passed_subquery.c.steps_passed_count >= threshold_80_steps, 1),
                else_=0
            )).label("count_gte_80"),

            # Диапазон 50% <= x < 80%
            func.sum(case(
                # Передаем кортеж (условие, результат) напрямую как позиционный аргумент
                (
                    (user_steps_passed_subquery.c.steps_passed_count >= threshold_50_steps) &
                    (user_steps_passed_subquery.c.steps_passed_count < threshold_80_steps),
                    1 # Результат если True
                ),
                else_=0
            )).label("count_gte_50_lt_80"),

            # Диапазон 25% <= x < 50%
            func.sum(case(
                # Передаем кортеж (условие, результат) напрямую как позиционный аргумент
                (
                    (user_steps_passed_subquery.c.steps_passed_count >= threshold_25_steps) &
                    (user_steps_passed_subquery.c.steps_passed_count < threshold_50_steps),
                    1 # Результат если True
                ),
                else_=0
            )).label("count_gte_25_lt_50")

        ).select_from(user_steps_passed_subquery) # Явно указываем FROM для подзапроса

        print(f"        Выполняется основной агрегирующий запрос...")
        range_counts_result = range_counts_query.first() # Должна вернуться одна строка с агрегатами
        print(f"        Агрегирующий запрос завершен.")

        # Извлекаем счетчики (или 0, если результат None)
        count_gte_80 = range_counts_result.count_gte_80 if range_counts_result else 0
        count_gte_50_lt_80 = range_counts_result.count_gte_50_lt_80 if range_counts_result else 0
        count_gte_25_lt_50 = range_counts_result.count_gte_25_lt_50 if range_counts_result else 0

        # Шаг 6: Считаем количество для диапазона <25%
        # Это все ученики МИНУС те, кто попал в верхние диапазоны
        count_lt_25 = total_learners - count_gte_80 - count_gte_50_lt_80 - count_gte_25_lt_50

        print(f"        Распределение по диапазонам (кол-во): >=80% -> {count_gte_80}, 50-79% -> {count_gte_50_lt_80}, 25-49% -> {count_gte_25_lt_50}, <25% -> {count_lt_25}")
        # Проверка: сумма должна быть равна total_learners
        if (count_gte_80 + count_gte_50_lt_80 + count_gte_25_lt_50 + count_lt_25) != total_learners:
             print("!!! ПРЕДУПРЕЖДЕНИЕ: Сумма учеников по диапазонам не сходится с общим числом учеников!")

        # Шаг 7: Заполняем результаты и считаем проценты
        # Убедимся, что все счетчики являются int
        count_gte_80 = int(count_gte_80)
        count_gte_50_lt_80 = int(count_gte_50_lt_80)
        count_gte_25_lt_50 = int(count_gte_25_lt_50)
        # count_lt_25 уже должен быть int, т.к. получен вычитанием int
        count_lt_25 = int(count_lt_25) # Можно добавить для надежности

        # Заполняем словарь результатов, приводя проценты к float
        completion_result["ranges"]["gte_80"]["count"] = count_gte_80
        completion_result["ranges"]["gte_80"]["percentage"] = float(count_gte_80 / total_learners) if total_learners > 0 else 0.0

        completion_result["ranges"]["gte_50_lt_80"]["count"] = count_gte_50_lt_80
        completion_result["ranges"]["gte_50_lt_80"]["percentage"] = float(count_gte_50_lt_80 / total_learners) if total_learners > 0 else 0.0

        completion_result["ranges"]["gte_25_lt_50"]["count"] = count_gte_25_lt_50
        completion_result["ranges"]["gte_25_lt_50"]["percentage"] = float(count_gte_25_lt_50 / total_learners) if total_learners > 0 else 0.0

        completion_result["ranges"]["lt_25"]["count"] = count_lt_25
        completion_result["ranges"]["lt_25"]["percentage"] = float(count_lt_25 / total_learners) if total_learners > 0 else 0.0

        # Убедимся, что и другие числовые поля в корне словаря являются int/float
        completion_result["total_learners"] = int(total_learners)
        completion_result["total_submittable_steps"] = int(total_submittable_steps)
        completion_result["ranges"]["gte_80"]["threshold_steps"] = int(threshold_80_steps)
        completion_result["ranges"]["gte_50_lt_80"]["threshold_steps"] = int(threshold_50_steps)
        completion_result["ranges"]["gte_25_lt_50"]["threshold_steps"] = int(threshold_25_steps)
        completion_result["ranges"]["lt_25"]["threshold_steps"] = int(threshold_25_steps) # Был threshold_25_steps, оставим его

        completion_result["message"] = "Calculation successful."
        storage[storage_key] = completion_result # Сохраняем итоговый результат

        print(f"    ... Расчет результативности завершен (за {(time.time() - completion_start_time):.2f} сек)")

    except Exception as e:
        print(f"!!! Ошибка при расчете результативности курса: {e}")
        # Сохраняем ошибку в хранилище
        storage[storage_key] = {"error": "Could not calculate completion rates", "details": str(e)}
        # Дополнительно выводим трассировку ошибки
        import traceback
        traceback.print_exc()

    total_global_calc_duration = time.time() - global_calc_start_time
    print(f"--- Расчет глобальных метрик завершен (общее время: {total_global_calc_duration:.2f} сек) ---")

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


@metrics_bp.route("/course/completion_rates", methods=['GET']) # НОВЫЙ URL
def get_course_completion_rates():
    """Возвращает ПРЕДВАРИТЕЛЬНО РАССЧИТАННУЮ результативность курса по диапазонам."""
    storage_key = 'course_completion_rates' # Используем новый ключ
    completion_data = calculated_metrics_storage.get(storage_key, {"error": f"Completion rate data ('{storage_key}') not pre-calculated."})

    # Используем ручной json.dumps для контроля ensure_ascii=False
    status_code = 500 if isinstance(completion_data, dict) and "error" in completion_data else 200
    json_string = json.dumps(completion_data, ensure_ascii=False, indent=2) # Добавил indent для читаемости
    return Response(json_string, status=status_code, mimetype='application/json; charset=utf-8')


@metrics_bp.route("/steps/structure", methods=['GET'])
def get_steps_structure():
    """
    Возвращает список ВСЕХ шагов с деталями, хронологией
    И КЛЮЧЕВЫМИ МЕТРИКАМИ ПРОИЗВОДИТЕЛЬНОСТИ.
    Использует in-memory кеш и ФАЙЛОВЫЙ кеш для персистентности.
    """
    global structure_with_metrics_cache # Убедимся, что используем глобальный словарь

    # 1. Проверка in-memory кеша
    if STRUCTURE_CACHE_KEY in structure_with_metrics_cache:
        print("--- /steps/structure: Возврат данных из IN-MEMORY КЕША ---")
        cached_data = structure_with_metrics_cache[STRUCTURE_CACHE_KEY]
        if isinstance(cached_data, list):
            json_string = json.dumps(cached_data, ensure_ascii=False)
            return Response(json_string, mimetype='application/json; charset=utf-8')
        else:
             print("--- /steps/structure: Ошибка - в in-memory кеше не список. Очистка кеша. ---")
             del structure_with_metrics_cache[STRUCTURE_CACHE_KEY] # Очищаем только in-memory

    # 2. Проверка файлового кеша (если in-memory пуст)
    print("--- /steps/structure: In-memory кеш пуст. Проверка файлового кеша... ---")
    file_cached_data = load_cache_from_file(STRUCTURE_CACHE_FILE)
    if file_cached_data is not None and isinstance(file_cached_data, list):
        # Если из файла загрузили, СОХРАНЯЕМ в in-memory кеш для быстрых последующих запросов
        structure_with_metrics_cache[STRUCTURE_CACHE_KEY] = file_cached_data
        print("--- /steps/structure: Возврат данных из ФАЙЛОВОГО КЕША (также сохранены в in-memory) ---")
        json_string = json.dumps(file_cached_data, ensure_ascii=False)
        return Response(json_string, mimetype='application/json; charset=utf-8')
    elif file_cached_data is not None: # Если загрузили, но это не список
         print("--- /steps/structure: Ошибка - в файловом кеше не список. Кеш будет пересчитан. ---")
         # Файл уже должен был быть удален функцией load_cache_from_file при ошибке

    # 3. Расчет данных (если оба кеша пусты или невалидны)
    print("--- /steps/structure: Расчет данных (кеши пусты или невалидны) ---")
    start_time = time.time()
    try:
        # ---> ВАШ СУЩЕСТВУЮЩИЙ КОД РАСЧЕТА ДАННЫХ <---
        # ... (Запросы к БД: all_steps_query, submissions_agg_query, comments_query) ...
        # ... (Формирование results_list) ...
        # 1. Запрос базовой структуры
        print("    [1/4] Запрос базовой структуры шагов...")
        # ... (код запроса all_steps_query) ...
        all_steps_query = db.session.query(Step).options(
            joinedload(Step.lesson).joinedload(Lesson.module).joinedload(Module.course),
            joinedload(Step.additional_info)
        ).join(Step.lesson).join(Lesson.module).join(Module.course)\
         .order_by(Course.course_id, Module.module_position, Lesson.lesson_position, Step.step_position)
        all_steps = all_steps_query.all()
        step_ids = [step.step_id for step in all_steps]
        print(f"    ... Найдено шагов: {len(all_steps)}")
        if not all_steps: return jsonify([])

        # 2. Агрегаты Submissions
        print("    [2/4] Запрос агрегированных данных из Submissions...")
        # ... (код запроса submissions_agg_query и создания submissions_data) ...
        submissions_agg_start = time.time()
        submissions_agg_query = db.session.query(
            Submission.step_id,
            func.count(Submission.submission_id).label("total_submissions"),
            func.sum(case((Submission.status == 'correct', 1), else_=0)).label("correct_submissions"),
            func.count(distinct(Submission.user_id)).label("total_attempted_users"),
            func.count(distinct(case((Submission.status == 'correct', Submission.user_id)))).label("passed_correctly_users")
        ).filter(Submission.step_id.in_(step_ids)).group_by(Submission.step_id)
        submissions_agg_results = submissions_agg_query.all()
        submissions_data = {
            row.step_id: {
                "total_submissions": row.total_submissions or 0, "correct_submissions": row.correct_submissions or 0,
                "total_attempted_users": row.total_attempted_users or 0, "passed_correctly_users": row.passed_correctly_users or 0,
            } for row in submissions_agg_results
        }
        print(f"    ... Агрегаты Submissions получены (за {(time.time() - submissions_agg_start):.2f} сек)")

        # 3. Данные по комментариям
        print("    [3/4] Запрос данных по комментариям...")
        # ... (код запроса comments_query и создания comments_data) ...
        comments_start = time.time()
        comments_query = db.session.query(
            Comment.step_id, func.count(Comment.comment_id).label("comments_count")
        ).filter(Comment.step_id.in_(step_ids)).group_by(Comment.step_id)
        comments_results = comments_query.all()
        comments_data = {row.step_id: row.comments_count or 0 for row in comments_results}
        print(f"    ... Данные по комментариям получены (за {(time.time() - comments_start):.2f} сек)")

        # 4. Формирование результата
        print("    [4/4] Формирование итогового результата...")
        # ... (код формирования results_list) ...
        results_list = []
        for step in all_steps:
            # ... (код создания step_data) ...
            step_data = {
                "step_id": step.step_id, "step_position": step.step_position, "step_type": step.step_type, "step_cost": step.step_cost,
                "lesson_id": step.lesson.lesson_id if step.lesson else None, "lesson_position": step.lesson.lesson_position if step.lesson else None,
                "module_id": step.lesson.module.module_id if step.lesson and step.lesson.module else None, "module_position": step.lesson.module.module_position if step.lesson and step.lesson.module else None,
                "module_title": step.lesson.module.title if step.lesson and step.lesson.module and hasattr(step.lesson.module, 'title') else None,
                "course_id": step.lesson.module.course.course_id if step.lesson and step.lesson.module and step.lesson.module.course else None,
                "course_title": step.lesson.module.course.title if step.lesson and step.lesson.module and step.lesson.module.course else None,
                "step_title_short": step.additional_info.step_title_short if step.additional_info else None, "step_title_full": step.additional_info.step_title_full if step.additional_info else None,
                "difficulty": step.additional_info.difficulty if step.additional_info else None, "discrimination": step.additional_info.discrimination if step.additional_info else None,
                "users_passed": 0, "all_users_attempted": 0, "step_effectiveness": 0.0, "success_rate": 0.0,
                "avg_attempts_per_passed_user": None, "comments_count": 0, "avg_completion_time_seconds": None,
            }
            step_submissions = submissions_data.get(step.step_id)
            if isinstance(step_submissions, dict):
                passed = step_submissions.get("passed_correctly_users", 0); attempted = step_submissions.get("total_attempted_users", 0)
                total_subs = step_submissions.get("total_submissions", 0); correct_subs = step_submissions.get("correct_submissions", 0)
                step_data["users_passed"] = passed; step_data["all_users_attempted"] = attempted
                step_data["step_effectiveness"] = (float(passed) / attempted) if attempted > 0 else 0.0
                step_data["success_rate"] = (float(correct_subs) / total_subs) if total_subs > 0 else 0.0
                step_data["avg_attempts_per_passed_user"] = (float(total_subs) / passed) if passed > 0 else None
            elif step_submissions is not None: print(f"!!! ПРЕДУПРЕЖДЕНИЕ: Ожидался dict в submissions_data для step_id {step.step_id}, но получен {type(step_submissions)}")
            step_data["comments_count"] = comments_data.get(step.step_id, 0)
            results_list.append(step_data)
        # ---> КОНЕЦ СУЩЕСТВУЮЩЕГО КОДА РАСЧЕТА <---

        # 5. СОХРАНЕНИЕ В ОБА КЕША
        if results_list: # Сохраняем только если есть результаты
            structure_with_metrics_cache[STRUCTURE_CACHE_KEY] = results_list # Сохраняем в in-memory
            save_cache_to_file(results_list, STRUCTURE_CACHE_FILE) # Сохраняем в файл
        else:
             print("--- /steps/structure: Расчет вернул пустой список. Кеши не обновлены. ---")


        total_duration = time.time() - start_time
        print(f"--- Формирование списка шагов С МЕТРИКАМИ завершено (за {total_duration:.2f} сек).")
        json_string = json.dumps(results_list, ensure_ascii=False)
        return Response(json_string, mimetype='application/json; charset=utf-8')

    except Exception as e:
        # Очищаем in-memory кеш при ошибке расчета
        if STRUCTURE_CACHE_KEY in structure_with_metrics_cache:
            del structure_with_metrics_cache[STRUCTURE_CACHE_KEY]
        # Файловый кеш НЕ удаляем здесь, т.к. он мог быть рабочим до ошибки

        total_duration = time.time() - start_time
        print(f"!!! Ошибка при расчете структуры шагов С МЕТРИКАМИ (за {total_duration:.2f} сек): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Could not retrieve step structure with metrics", "details": str(e)}), 500


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
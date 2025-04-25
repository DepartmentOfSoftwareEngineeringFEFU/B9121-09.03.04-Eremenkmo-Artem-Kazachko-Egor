import json
import math
from flask import Response, Blueprint, jsonify, request, current_app, abort
from .models import db, Submission, Learner, Step, Comment, Lesson, Module, AdditionalStepInfo, Course
from sqlalchemy import func, distinct, case, cast, Float, text
from .app_state import calculated_metrics_storage
from sqlalchemy.orm import joinedload

metrics_bp = Blueprint('metrics', __name__, url_prefix='/api/metrics')


def calculate_global_metrics(storage):
    """Рассчитывает глобальные метрики и сохраняет их в переданный словарь storage."""
    print("    Расчет списка преподавателей...")
    try:
        teachers = db.session.query(Learner).filter(Learner.is_learner == False).order_by(Learner.last_name, Learner.first_name).all()
        teacher_list = []
        for teacher in teachers:
            teacher_list.append({
                "user_id": teacher.user_id, "first_name": teacher.first_name, "last_name": teacher.last_name,
                "last_login": teacher.last_login.isoformat() if teacher.last_login else None,
                "data_joined": teacher.data_joined.isoformat() if teacher.data_joined else None
            })
        storage['teachers'] = teacher_list # Сохраняем в хранилище
        print(f"    Найдено преподавателей: {len(teacher_list)}")
    except Exception as e:
        print(f"!!! Ошибка при расчете списка преподавателей: {e}")
        storage['teachers'] = {"error": "Could not calculate teachers", "details": str(e)}

    print("    Расчет результативности курса (>= 80% порог)...")
    try:
        # Копируем логику расчета из эндпоинта сюда
        submittable_steps_query = db.session.query(Step.step_id).filter(Step.step_cost.isnot(None), Step.step_cost > 0)
        submittable_step_ids = [s.step_id for s in submittable_steps_query.all()]
        total_learners = db.session.query(func.count(Learner.user_id)).scalar() or 0
        completion_result = { # Готовим результат по умолчанию
            "course_completion_rate_80_percent": 0.0, "users_completed_at_80_percent": 0, 
            "total_learners": total_learners, "total_submittable_steps": 0, 
            "threshold_steps_for_80_percent": 0, "message": "No calculation performed yet."
        }
        if not submittable_step_ids:
            completion_result["message"] = "No steps requiring submission (step_cost > 0) found."
            print("    Оцениваемые шаги не найдены.")
        else:
            total_submittable_steps = len(submittable_step_ids)
            threshold_steps = math.ceil(total_submittable_steps * 0.80)
            user_steps_passed_subquery = db.session.query(
                Submission.user_id, func.count(distinct(Submission.step_id)).label('steps_passed_count')
            ).filter(Submission.step_id.in_(submittable_step_ids), Submission.status == 'correct').group_by(Submission.user_id).subquery()
            users_completed_course = db.session.query(func.count(user_steps_passed_subquery.c.user_id)).filter(
                user_steps_passed_subquery.c.steps_passed_count >= threshold_steps).scalar() or 0
            completion_rate = (float(users_completed_course) / float(total_learners)) if total_learners > 0 else 0.0
            completion_result.update({ # Обновляем результат
                "course_completion_rate_80_percent": completion_rate, 
                "users_completed_at_80_percent": users_completed_course,
                "total_submittable_steps": total_submittable_steps,
                "threshold_steps_for_80_percent": threshold_steps,
                "message": "Calculation successful."
            })
            print(f"    Результативность (>=80%): {completion_rate:.4f}, Прошли: {users_completed_course}, Порог: {threshold_steps}/{total_submittable_steps}")

        storage['course_completion_rate_80'] = completion_result # Сохраняем в хранилище
    except Exception as e:
        print(f"!!! Ошибка при расчете результативности курса: {e}")
        storage['course_completion_rate_80'] = {"error": "Could not calculate completion rate", "details": str(e)}

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


@metrics_bp.route("/course/completion_rate_80_percent", methods=['GET']) 
def get_course_completion_rate_80_percent():
    """Возвращает ПРЕДВАРИТЕЛЬНО РАССЧИТАННУЮ результативность курса (>= 80% порог)."""
    # Просто возвращаем данные из хранилища
    completion_data = calculated_metrics_storage.get('course_completion_rate_80', {"error": "Completion rate not pre-calculated."})
    
    if isinstance(completion_data, dict) and "error" in completion_data:
        return jsonify(completion_data), 500
    else:
        return jsonify(completion_data)


@metrics_bp.route("/steps/structure", methods=['GET'])
def get_steps_structure():
    """Возвращает список ВСЕХ шагов с деталями и хронологией."""
    print("--- Запрос структуры всех шагов ---")
    try:
        # Запрашиваем все шаги, сразу подгружая связанные данные для эффективности
        all_steps_query = db.session.query(Step).options(
            # Загружаем цепочку Lesson -> Module -> Course
            joinedload(Step.lesson).joinedload(Lesson.module).joinedload(Module.course),
            # Загружаем дополнительную информацию
            joinedload(Step.additional_info)
        # Присоединяем таблицы явно, чтобы по ним можно было сортировать
        ).join(Step.lesson).join(Lesson.module).join(Module.course)\
         .order_by( # Сортируем по иерархии курса
             Course.course_id,        # Сначала по курсу
             Module.module_position,  # Потом по позиции модуля в курсе
             Lesson.lesson_position,  # Потом по позиции урока в модуле
             Step.step_position       # Наконец, по позиции шага в уроке
         )

        all_steps = all_steps_query.all()
        print(f"    Найдено шагов: {len(all_steps)}")

        # Формируем список результатов
        results_list = []
        for step in all_steps:
            step_data = {
                # Данные из Step
                "step_id": step.step_id,
                "step_position": step.step_position,
                "step_type": step.step_type,
                "step_cost": step.step_cost, # Оценивается ли шаг (0 или >0)
                # Данные из Lesson (если есть связь)
                "lesson_id": None,
                "lesson_position": None,
                # Данные из Module (если есть связь)
                "module_id": None,
                "module_position": None,
                # Данные из Course (если есть связь)
                "course_id": None,
                "course_title": None,
                # Данные из AdditionalStepInfo (если есть связь)
                "step_title_short": None,
                "step_title_full": None,
                "difficulty": None,       # Сложность из доп. инфо
                "discrimination": None    # Дискриминативность из доп. инфо
            }

            # Заполняем данные из связанных таблиц
            if step.lesson:
                step_data["lesson_id"] = step.lesson.lesson_id
                step_data["lesson_position"] = step.lesson.lesson_position
                if step.lesson.module:
                    step_data["module_id"] = step.lesson.module.module_id
                    step_data["module_position"] = step.lesson.module.module_position
                    if step.lesson.module.course:
                        step_data["course_id"] = step.lesson.module.course.course_id
                        step_data["course_title"] = step.lesson.module.course.title

            if step.additional_info:
                step_data["step_title_short"] = step.additional_info.step_title_short
                step_data["step_title_full"] = step.additional_info.step_title_full
                step_data["difficulty"] = step.additional_info.difficulty
                step_data["discrimination"] = step.additional_info.discrimination

            results_list.append(step_data)

        print("--- Формирование списка шагов завершено.")
        return jsonify(results_list)

    except Exception as e:
        print(f"!!! Ошибка при получении структуры шагов: {e}")
        return jsonify({"error": "Could not retrieve step structure", "details": str(e)}), 500


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
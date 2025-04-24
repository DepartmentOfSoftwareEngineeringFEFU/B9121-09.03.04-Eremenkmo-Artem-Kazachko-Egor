import json
import math
from flask import Response, Blueprint, jsonify, request, current_app
from .models import db, Submission, Learner, Step, Comment, Lesson, Module
from sqlalchemy import func, distinct, case, cast, Float, text
from .app_state import calculated_metrics_storage

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



@metrics_bp.route("/step/<int:step_id>/users_passed", methods=['GET'])
def get_users_passed_step(step_id):
    """Количество людей, прошедших шаг и общее"""
    count = db.session.query(func.count(distinct(Submission.user_id)))\
        .filter(Submission.step_id == step_id, Submission.status == 'correct')\
        .scalar()
    allcount = db.session.query(func.count(distinct(Submission.user_id)))\
        .filter(Submission.step_id == step_id)\
        .scalar()
    return jsonify({"step_id": step_id, "users_passed": count or 0, "all_users": allcount or 0})



@metrics_bp.route("/step/<int:step_id>/effectiveness", methods=['GET'])
def get_step_effectiveness(step_id):
    """Результативность шага (Прошедшие / Приступившие)"""
    result = db.session.query(
        (
            cast(func.count(distinct(case((Submission.status == 'correct', Submission.user_id)))), Float) /
            func.coalesce(cast(func.count(distinct(Submission.user_id)), Float), 1.0)
        ).label('effectiveness')
    ).filter(Submission.step_id == step_id).first()

    total_attempts = db.session.query(func.count(Submission.submission_id)).filter(Submission.step_id == step_id).scalar()
    
    effectiveness = 0.0 
    if result and total_attempts > 0: 
        effectiveness = result.effectiveness 
    return jsonify({"step_id": step_id, "step_effectiveness": effectiveness})



@metrics_bp.route("/step/<int:step_id>/avg_completion_time", methods=['GET'])
def get_avg_completion_time(step_id):
    """Среднее время прохождения шага (сек)"""
    user_step_times = db.session.query(
        Submission.user_id,
        func.min(Submission.submission_time).label('first_attempt_time'),
        func.min(case((Submission.status == 'correct', Submission.submission_time))).label('first_correct_time')
    ).filter(Submission.step_id == step_id)\
     .group_by(Submission.user_id)\
     .subquery()

    avg_time_result = db.session.query(
        func.avg(
             func.timestampdiff(text('SECOND'), user_step_times.c.first_attempt_time, user_step_times.c.first_correct_time)
        ).label('avg_seconds')
    ).filter(user_step_times.c.first_correct_time.isnot(None)).first()

    avg_seconds = avg_time_result.avg_seconds if avg_time_result and avg_time_result.avg_seconds is not None else None
    return jsonify({"step_id": step_id, "avg_completion_time_seconds": avg_seconds})



@metrics_bp.route("/step/<int:step_id>/success_rate", methods=['GET'])
def get_step_success_rate(step_id):
    """Процент успеха попыток на шаге (верные / все)"""
    result = db.session.query(
        (
            cast(func.sum(case((Submission.status == 'correct', 1), else_=0)), Float) /
            func.coalesce(cast(func.count(Submission.submission_id), Float), 1.0)
        ).label('success_rate')
    ).filter(Submission.step_id == step_id).first()

    total_submissions = db.session.query(func.count(Submission.submission_id)).filter(Submission.step_id == step_id).scalar()

    success_rate = 0.0
    if result and total_submissions > 0:
        success_rate = result.success_rate
    return jsonify({"step_id": step_id, "success_rate": success_rate})



@metrics_bp.route("/step/<int:step_id>/avg_attempts", methods=['GET'])
def get_avg_attempts_per_passed(step_id):
    """Среднее число попыток прохождения шага (все / верные)"""
    result = db.session.query(
        (
            cast(func.count(Submission.submission_id), Float) /
            func.coalesce(cast(func.count(distinct(case((Submission.status == 'correct', Submission.user_id)))), Float), 1.0)
        ).label('avg_attempts')
    ).filter(Submission.step_id == step_id).first()

    users_passed_count = db.session.query(func.count(distinct(Submission.user_id)))\
        .filter(Submission.step_id == step_id, Submission.status == 'correct').scalar()

    avg_attempts = None 
    if result and users_passed_count > 0:
        avg_attempts = result.avg_attempts
    return jsonify({"step_id": step_id, "avg_attempts_per_passed_user": avg_attempts})



@metrics_bp.route("/step/<int:step_id>/comments_count", methods=['GET'])
def get_step_comments_count(step_id):
    """Количество комментариев к шагу"""
    count = db.session.query(func.count(Comment.comment_id))\
        .filter(Comment.step_id == step_id)\
        .scalar()
    return jsonify({"step_id": step_id, "comments_count": count or 0})
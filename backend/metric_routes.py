from flask import Blueprint, jsonify, request, current_app
from .models import db, Submission, Learner, Step, Comment, Lesson, Module
from sqlalchemy import func, distinct, case, cast, Float, text


metrics_bp = Blueprint('metrics', __name__, url_prefix='/api/metrics')

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



@metrics_bp.route("/course/completion_rate", methods=['GET'])
def get_course_completion_rate():
    """Общая результативность курса (все шаги в БД)"""

    all_steps = db.session.query(Step.step_id).all()
    step_ids = [s.step_id for s in all_steps]

    total_learners = db.session.query(func.count(Learner.user_id)).scalar() or 0

    if not step_ids:
        return jsonify({
            "course_completion_rate": 0.0,
            "users_completed": 0,
            "total_learners": total_learners,
            "total_steps_in_course": 0,
            "message": "No steps found in the database."
        })

    total_steps_in_course = len(step_ids)

    # Подзапрос: user_id и количество уникальных пройденных шагов для каждого
    user_steps_passed_subquery = db.session.query(
            Submission.user_id,
            func.count(distinct(Submission.step_id)).label('steps_passed_count')
        )\
        .filter(Submission.step_id.in_(step_ids), Submission.status == 'correct')\
        .group_by(Submission.user_id)\
        .subquery()

    # Основной запрос: считаем пользователей, у которых число пройденных шагов = общему числу шагов
    users_completed_course = db.session.query(func.count(user_steps_passed_subquery.c.user_id))\
        .filter(user_steps_passed_subquery.c.steps_passed_count == total_steps_in_course)\
        .scalar() or 0 

    completion_rate = (float(users_completed_course) / float(total_learners)) if total_learners > 0 else 0.0

    return jsonify({
        "course_completion_rate": completion_rate,
        "users_completed": users_completed_course,
        "total_learners": total_learners,
        "total_steps_in_course": total_steps_in_course
    })
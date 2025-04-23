from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy.dialects.mysql import LONGTEXT

db = SQLAlchemy()

class Module(db.Model):
    __tablename__ = 'module'
    module_id = db.Column(db.Integer, primary_key=True)
    module_position = db.Column(db.Integer, nullable=False)

class Lesson(db.Model):
    __tablename__ = 'lesson'
    lesson_id = db.Column(db.Integer, primary_key=True)
    lesson_position = db.Column(db.Integer, nullable=False)
    module_id = db.Column(db.Integer, db.ForeignKey('module.module_id'), nullable=True)
    module = db.relationship('Module', backref=db.backref('lessons', lazy=True))

class Step(db.Model):
    __tablename__ = 'step'
    step_id = db.Column(db.Integer, primary_key=True)
    step_position = db.Column(db.Integer, nullable=False)
    step_type = db.Column(db.String(255), nullable=True)
    step_cost = db.Column(db.Integer, nullable=True)
    lesson_id = db.Column(db.Integer, db.ForeignKey('lesson.lesson_id'), nullable=True)
    lesson = db.relationship('Lesson', backref=db.backref('steps', lazy=True))

class Learner(db.Model):
    __tablename__ = 'learner'
    user_id = db.Column(db.Integer, primary_key=True)
    last_name = db.Column(db.String(255), nullable=True)
    first_name = db.Column(db.String(255), nullable=True)
    last_login = db.Column(db.DateTime, nullable=True)
    data_joined = db.Column(db.DateTime, nullable=True)
    date_usual_certificate = db.Column(db.Date, nullable=True)
    date_exellent_certificate = db.Column(db.Date, nullable=True)
    is_learner = db.Column(db.Boolean, nullable=False, default=True)

class Submission(db.Model):
    __tablename__ = 'submission'
    submission_id = db.Column(db.Integer, primary_key=True)
    step_id = db.Column(db.Integer, db.ForeignKey('step.step_id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('learner.user_id'), nullable=True)
    attempt_time = db.Column(db.DateTime, nullable=True)
    submission_time = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(255), nullable=True)
    score = db.Column(db.Integer, nullable=True) 
    step = db.relationship('Step', backref=db.backref('submissions', lazy=True))
    user = db.relationship('Learner', backref=db.backref('submissions', lazy=True))

class Comment(db.Model):
    __tablename__ = 'comment'
    comment_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('learner.user_id'), nullable=True)
    step_id = db.Column(db.Integer, db.ForeignKey('step.step_id'), nullable=True)
    parent_comment_id = db.Column(db.Integer, db.ForeignKey('comment.comment_id'), nullable=True)
    time = db.Column(db.DateTime, nullable=True)
    deleted = db.Column(db.Boolean, nullable=True)
    text_clear = db.Column(LONGTEXT, nullable=True)
    user = db.relationship('Learner', backref=db.backref('comments', lazy=True))
    step = db.relationship('Step', backref=db.backref('comments', lazy=True))
    parent_comment = db.relationship('Comment', remote_side=[comment_id], backref='replies')
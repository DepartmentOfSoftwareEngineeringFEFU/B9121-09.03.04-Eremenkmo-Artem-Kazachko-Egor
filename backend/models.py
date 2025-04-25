from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy import String, Text, Float, ForeignKey, Integer

db = SQLAlchemy()

enrollment_table = db.Table('enrollment',
    db.Column('learner_id', Integer, ForeignKey('learner.user_id'), primary_key=True),
    db.Column('course_id', Integer, ForeignKey('course.course_id'), primary_key=True),
    db.Column('enrollment_date', db.DateTime, default=datetime.utcnow) # db.DateTime, а не DateTime
)

class Course(db.Model):
    __tablename__ = 'course'
    course_id = db.Column(Integer, primary_key=True) # ID курса (может быть из ваших данных или автоинкремент)
    title = db.Column(String(255), nullable=False, unique=True) # Название курса
    # Добавьте другие поля по желанию: description, start_date, etc.

    # Связь с модулями этого курса
    modules = db.relationship('Module', backref='course', lazy=True)
    learners = db.relationship(
    'Learner',
    secondary=enrollment_table,
    back_populates='courses',
    lazy='dynamic'
)

    def __repr__(self):
        return f'<Course {self.course_id}: {self.title}>'

class Module(db.Model):
    __tablename__ = 'module'
    module_id = db.Column(Integer, primary_key=True)
    module_position = db.Column(Integer, nullable=False)
    # ---> ДОБАВЛЯЕМ СВЯЗЬ С КУРСОМ <---
    course_id = db.Column(Integer, ForeignKey('course.course_id'), nullable=False)

class Lesson(db.Model):
    # ... (код без изменений) ...
    __tablename__ = 'lesson'
    lesson_id = db.Column(Integer, primary_key=True)
    lesson_position = db.Column(Integer, nullable=False)
    module_id = db.Column(Integer, db.ForeignKey('module.module_id'), nullable=True)
    module = db.relationship('Module', backref=db.backref('lessons', lazy=True))

class Step(db.Model):
    __tablename__ = 'step'
    step_id = db.Column(Integer, primary_key=True)
    step_position = db.Column(Integer, nullable=False)
    step_type = db.Column(String(255), nullable=True)
    step_cost = db.Column(Integer, nullable=True)
    lesson_id = db.Column(Integer, db.ForeignKey('lesson.lesson_id'), nullable=True)
    lesson = db.relationship('Lesson', backref=db.backref('steps', lazy=True))
    additional_info = db.relationship(
        'AdditionalStepInfo',
        backref='step',         # Как обращаться к Step из AdditionalStepInfo (step.step)
        uselist=False,          # Указывает, что это один-к-одному
        cascade="all, delete-orphan"
    )

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
    courses = db.relationship(
    'Course',
    secondary=enrollment_table,
    back_populates='learners',
    lazy='dynamic'
)

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

class AdditionalStepInfo(db.Model):
    __tablename__ = 'additional_step_info'
    # step_id является и первичным ключом этой таблицы,
    # и внешним ключом, ссылающимся на Step.step_id
    step_id = db.Column(db.Integer, ForeignKey('step.step_id'), primary_key=True)
    step_title_short = db.Column(String(255), nullable=True)
    step_title_full = db.Column(Text, nullable=True) # Используем Text для потенциально длинных названий
    difficulty = db.Column(Float, nullable=True)     # Float для дробных чисел
    discrimination = db.Column(Float, nullable=True) # Float для дробных чисел

    def __repr__(self):
        return f'<AdditionalStepInfo for Step {self.step_id}>'
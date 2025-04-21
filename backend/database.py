import pymysql
import csv
from datetime import datetime
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView


app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:1106@localhost/learning_plat_test_two'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy()

def create_database_if_not_exists(database_name, user, password, host='localhost'):
    connection = pymysql.connect(
        host=host,
        user=user,
        password=password
    )
    cursor = connection.cursor()
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS {database_name}")
    connection.close()


# Проверка и создание базы данных перед её использованием
create_database_if_not_exists('learning_plat_test_two', user='root', password='1106')
db.init_app(app)

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
    text_clear = db.Column(db.Text, nullable=True)
    user = db.relationship('Learner', backref=db.backref('comments', lazy=True))
    step = db.relationship('Step', backref=db.backref('comments', lazy=True))
    parent_comment = db.relationship('Comment', remote_side=[comment_id], backref='replies')

#--------------------------------------------------------------------------------------------------------#

def parse_datetime(date_str):
    if not date_str:
        return None
    try:
        # Если строка содержит часовой пояс, обрабатываем его
        return datetime.strptime(date_str.strip(), '%Y-%m-%d %H:%M:%S%z')
    except ValueError:
        try:
            # Если часового пояса нет, удаляем лишнее и парсим
            return datetime.strptime(date_str.strip(), '%Y-%m-%d %H:%M:%S')
        except ValueError:
            # Если это Unix-время (timestamp)
            timestamp = int(date_str)
            return datetime.fromtimestamp(timestamp)

def import_learners(limit=5000):
    with open('backend/learners.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for idx, item in enumerate(reader):
            if idx >= limit:
                break
            new_entry = Learner(
                user_id=int(item[0]),
                last_name=item[1],
                first_name=item[2],
                last_login=parse_datetime(item[3]),
                data_joined=parse_datetime(item[4]),
            )
            try:
                db.session.merge(new_entry)
            except Exception as e:
                print(f"----------Ошибка в импорте записи {item}: {e}")
        db.session.commit()
    print(f"----------Импортировано {min(limit, idx)} записей из learners.csv.")

def import_structure(limit=5000):
    with open('backend/structure.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for idx, item in enumerate(reader):
            if idx >= limit:
                break

            new_entry = Module(
                module_id=int(item[1]),
                module_position=int(item[2]),
            )
            try:
                db.session.merge(new_entry)
            except Exception as e:
                print(f"----------Ошибка в импорте записи {item}: {e}")

            new_entry = Lesson(
                lesson_id=int(item[3]),
                lesson_position=int(item[4]),
                module_id=int(item[1]),
            )
            try:
                db.session.merge(new_entry)
            except Exception as e:
                print(f"----------Ошибка в импорте записи {item}: {e}")

            new_entry = Step(
                step_id=int(item[5]),
                step_position=int(item[6]),
                step_type=item[7],
                step_cost=int(item[8]) if item[8] else None,
                lesson_id=int(item[3]),
            )
            try:
                db.session.merge(new_entry)
            except Exception as e:
                print(f"----------Ошибка в импорте записи {item}: {e}")

        db.session.commit()
    print(f"----------Импортировано {min(limit, idx + 1)} записей из structure.csv")


def import_comments(limit=5000):
    with open('backend/comments.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for idx, item in enumerate(reader):
            if idx >= limit:
                break

            user_id = int(item[1])
            last_name = item[2]
            first_name = item[3]
            step_id = int(item[4])
            parent_comment_id = int(item[5]) if item[5] and item[5] != '0' else None

            step_exists = Step.query.filter_by(step_id=step_id).first()
            user_exists = Learner.query.filter_by(user_id=user_id).first()

            if not user_exists:
                new_learner = Learner(user_id=user_id, last_name=last_name, first_name=first_name, is_learner=False)
                db.session.add(new_learner)
                print(f"Отсутствующий в таблице Learner user_id добавлен как преподаватель: {user_id}")

            new_comment = Comment(
                comment_id=int(item[0]),
                user_id=user_id,
                step_id=step_id,
                parent_comment_id=parent_comment_id if parent_comment_id else None,
                time=parse_datetime(item[6]),
                deleted=item[7] == '1',
                text_clear=item[9],
            )
            try:
                db.session.merge(new_comment)
            except Exception as e:
                print(f"Ошибка в импорте комментария {item[0]}: {e}")
        
        db.session.commit()
    print(f"----------Импортировано {min(limit, idx + 1)} комментариев из comments.csv.")


def import_submissions(limit=5000):
    with open('backend/submissions.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for idx, item in enumerate(reader):
            if idx >= limit:
                break

            step_exists = Step.query.filter_by(step_id=int(item[1])).first()
            user_exists = Learner.query.filter_by(user_id=int(item[2])).first()

            if not step_exists:
                print(f"Пропуск submission {item[0]}: Шага {item[1]} не существует.")
                continue

            if not user_exists:
                print(f"Пропуск submission {item[0]}: Пользователя {item[2]} не существует.")
                continue

            new_entry = Submission(
                submission_id=int(item[0]),
                step_id=int(item[1]),
                user_id=int(item[2]),
                attempt_time=parse_datetime(item[5]),
                submission_time=parse_datetime(item[6]),
                status=item[7],
                score=float(item[8]) if item[8] else None,
            )
            try:
                db.session.merge(new_entry)
            except Exception as e:
                print(f"----------Ошибка в импорте записи {item}: {e}")

        db.session.commit()
    print(f"----------Импортировано {min(limit, idx + 1)} записей из submissions.csv")

# Создание базы данных
with app.app_context():
    db.create_all()
    print("----------База данных успешно создана")
    import_learners()
    import_structure()
    import_comments()
    import_submissions()

# Для просмотра таблиц в браузере: после загрузки данных он выдаст адрес, к нему добавляем /admin
class MyModelView(ModelView):
    column_display_pk = True

admin = Admin(app, template_mode="bootstrap3")
admin.add_view(ModelView(Module, db.session))
admin.add_view(ModelView(Lesson, db.session))
admin.add_view(ModelView(Learner, db.session))
admin.add_view(ModelView(Comment, db.session))
admin.add_view(ModelView(Submission, db.session))
admin.add_view(ModelView(Step, db.session))

if __name__ == '__main__':
    app.run(debug=True)
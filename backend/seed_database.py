import csv
import sys
import pymysql
from datetime import datetime

# Импортируем app для контекста, db и Модели
# Предполагается, что database.py и models.py находятся в той же папке backend
from backend.database import app, create_database_if_not_exists 
from backend.models import db, Module, Lesson, Step, Learner, Submission, Comment


print("----------Настройка CSV field size limit...")
# Попробуем установить очень большой лимит (например, 100 МБ)
large_limit = 100 * 1024 * 1024  # 100 MB

try:
    limit_set = large_limit
    # Проверяем, не превышает ли наш лимит системный максимум
    # (sys.maxsize может быть больше, чем допустимо для field_size_limit)
    max_possible = sys.maxsize
    while True:
        try:
            csv.field_size_limit(max_possible)
            # Если системный максимум сработал, используем наш большой лимит,
            # если он не больше системного максимума
            limit_set = min(large_limit, max_possible)
            break
        except OverflowError:
            # Если системный максимум не сработал, уменьшаем его
            max_possible = int(max_possible / 2)
            if max_possible == 0:
                 # Если дошли до нуля, используем изначальный большой лимит как последнюю попытку
                 limit_set = large_limit 
                 break 
                 
    print(f"----------Пытаемся установить CSV field size limit на: {limit_set}")
    csv.field_size_limit(limit_set)
    print(f"----------CSV field size limit успешно установлен.")

except Exception as e:
    # Если даже после попыток установить не удалось, выводим ошибку
    print(f"!!! Не удалось установить CSV field size limit. Ошибка: {e}")
    # Можно либо прервать выполнение, либо продолжить со стандартным лимитом,
    # но тогда ошибка _csv.Error скорее всего повторится.
    # raise # Раскомментировать, если хотите остановить скрипт при неудаче установки лимита


def parse_datetime(date_str):
    if not date_str: return None
    try: return datetime.strptime(date_str.strip(), '%Y-%m-%d %H:%M:%S%z')
    except ValueError:
        try: return datetime.strptime(date_str.strip(), '%Y-%m-%d %H:%M:%S')
        except ValueError:
            try:
                timestamp = int(float(date_str)) # Обработка float timestamp
                return datetime.fromtimestamp(timestamp)
            except ValueError:
                print(f"!!! Ошибка парсинга даты: {date_str}")
                return None


def import_learners(limit=400000):
    print(f"----------Начало импорта learners (лимит: {limit})...")
    imported_count = 0
    skipped_count = 0
    last_idx = 0
    with open('backend/learners.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader) # Пропуск заголовка
        for idx, item in enumerate(reader):
            last_idx = idx
            if idx >= limit:
                print(f"----------Достигнут лимит импорта ({limit}).")
                break
            
            if idx > 0 and idx % 10000 == 0:
                print(f"----------Обработано {idx} строк из learners.csv...")

            learner_id_str = item[0]
            try:
                # Парсинг и создание объекта
                new_entry = Learner(
                    user_id=int(learner_id_str),
                    last_name=item[1],
                    first_name=item[2],
                    last_login=parse_datetime(item[3]),
                    data_joined=parse_datetime(item[4]),
                )
                # Добавление/обновление
                db.session.merge(new_entry)
                imported_count += 1
            except Exception as e:
                db.session.rollback() # Откат для этой строки
                print(f"--- ОШИБКА при обработке строки {idx+1} (Learner ID: {learner_id_str}). Строка пропущена. ---")
                print(f"    Ошибка: {type(e).__name__}: {e}")
                skipped_count += 1
    
    # Финальный коммит
    print("----------Завершение цикла learners. Попытка финального коммита...")
    try:
        db.session.commit()
        print("-" * 30)
        print(f"ИТОГ ИМПОРТА LEARNERS:")
        print(f"  Успешно импортировано/обновлено: {imported_count}")
        print(f"  Пропущено из-за ошибок: {skipped_count}")
        print(f"  Всего обработано строк (до лимита): {last_idx + 1}")
        print("-" * 30)
    except Exception as e:
         print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при финальном коммите learners: {e}")
         db.session.rollback()

def import_structure(limit=150000):
    print(f"----------Начало импорта structure (лимит: {limit})...")
    modules_count, lessons_count, steps_count = 0, 0, 0
    skipped_count = 0
    last_idx = 0
    # Используем множества для отслеживания уже обработанных ID в этом запуске
    processed_modules = set()
    processed_lessons = set()
    processed_steps = set()
    
    with open('backend/structure.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader) # Пропуск заголовка
        for idx, item in enumerate(reader):
            last_idx = idx
            if idx >= limit:
                print(f"----------Достигнут лимит импорта ({limit}).")
                break

            if idx > 0 and idx % 10000 == 0:
                print(f"----------Обработано {idx} строк из structure.csv...")

            try:
                # Парсинг ID
                module_id = int(item[1])
                lesson_id = int(item[3])
                step_id = int(item[5])
                
                # Merge Module (если еще не обработан в этом запуске)
                if module_id not in processed_modules:
                    new_module = Module(module_id=module_id, module_position=int(item[2]))
                    db.session.merge(new_module)
                    processed_modules.add(module_id)
                    modules_count += 1 # Считаем только первое добавление/обновление

                # Merge Lesson (если еще не обработан в этом запуске)
                if lesson_id not in processed_lessons:
                    new_lesson = Lesson(lesson_id=lesson_id, lesson_position=int(item[4]), module_id=module_id)
                    db.session.merge(new_lesson)
                    processed_lessons.add(lesson_id)
                    lessons_count += 1

                # Merge Step (если еще не обработан в этом запуске)
                if step_id not in processed_steps:
                    new_step = Step(
                        step_id=step_id, 
                        step_position=int(item[6]), 
                        step_type=item[7], 
                        step_cost=int(item[8]) if item[8] else None, 
                        lesson_id=lesson_id
                    )
                    db.session.merge(new_step)
                    processed_steps.add(step_id)
                    steps_count += 1

            except Exception as e:
                db.session.rollback() # Откат для этой строки
                print(f"--- ОШИБКА при обработке строки {idx+1} (structure.csv). Строка пропущена. ---")
                print(f"    Данные: {item}")
                print(f"    Ошибка: {type(e).__name__}: {e}")
                skipped_count += 1

    # Финальный коммит
    print("----------Завершение цикла structure. Попытка финального коммита...")
    try:
        db.session.commit()
        print("-" * 30)
        print(f"ИТОГ ИМПОРТА STRUCTURE:")
        print(f"  Успешно импортировано/обновлено уникальных:")
        print(f"    Modules: {modules_count}")
        print(f"    Lessons: {lessons_count}")
        print(f"    Steps: {steps_count}")
        print(f"  Строк пропущено из-за ошибок: {skipped_count}")
        print(f"  Всего обработано строк (до лимита): {last_idx + 1}")
        print("-" * 30)
    except Exception as e:
         print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при финальном коммите structure: {e}")
         db.session.rollback()


def import_comments(limit=200000):
    print(f"----------Начало импорта комментариев (лимит: {limit})...")
    with open('backend/comments.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader) # Пропускаем заголовок
        
        imported_count = 0
        skipped_count = 0
        teachers_added = 0
        last_idx = 0
        
        print("----------Предзагрузка существующих ID пользователей и шагов...")
        existing_user_ids = {u.user_id for u in db.session.query(Learner.user_id).all()}
        existing_step_ids = {s.step_id for s in db.session.query(Step.step_id).all()}
        print(f"----------Загружено {len(existing_user_ids)} user ID и {len(existing_step_ids)} step ID.")

        for idx, item in enumerate(reader):
            last_idx = idx
            if idx >= limit:
                print(f"----------Достигнут лимит импорта ({limit}).")
                break
                
            if idx > 0 and idx % 10000 == 0:
                print(f"----------Обработано {idx} строк из comments.csv...")

            comment_id_str = item[0] 
            try:
                user_id = int(item[1])
                last_name = item[2] 
                first_name = item[3] 
                step_id = int(item[4])
                comment_id = int(comment_id_str)
                parent_comment_id = int(item[5]) if item[5] and item[5] != '0' else None
                time_val = parse_datetime(item[6])
                deleted_val = item[7] == '1'
                text_val = item[9]

                if user_id not in existing_user_ids:
                    # Логика добавления преподавателя
                    print(f"Отсутствующий user_id {user_id}. Добавляется как преподаватель ({first_name} {last_name}).")
                    new_learner = Learner(
                        user_id=user_id, 
                        last_name=last_name, 
                        first_name=first_name, 
                        is_learner=False # Устанавливаем флаг преподавателя
                    )
                    db.session.add(new_learner)
                    # !!! ДОБАВИТЬ FLUSH ЗДЕСЬ !!!
                    # Это отправит INSERT для Learner в БД в текущей транзакции,
                    # делая его доступным для проверки внешнего ключа Comment.
                    try:
                        db.session.flush() 
                    except Exception as flush_err:
                        # Обработка возможной ошибки при flush (например, дубликат user_id если гонка потоков, хотя здесь маловероятно)
                        db.session.rollback()
                        print(f"--- ОШИБКА при flush нового Learner ID: {user_id}. Строка {idx+1} пропущена. ---")
                        print(f"    Ошибка flush: {type(flush_err).__name__}: {flush_err}")
                        skipped_count += 1
                        continue # Пропускаем остаток итерации

                    existing_user_ids.add(user_id) # Добавляем в set ПОСЛЕ успешного flush
                    teachers_added += 1
                    
                if step_id not in existing_step_ids:
                    skipped_count += 1
                    continue 

                new_comment = Comment(comment_id=comment_id, user_id=user_id, step_id=step_id, parent_comment_id=parent_comment_id, time=time_val, deleted=deleted_val, text_clear=text_val)
                db.session.merge(new_comment) 
                imported_count += 1

            except Exception as e:
                db.session.rollback() 
                print(f"--- ОШИБКА при обработке строки {idx+1} (Comment ID: {comment_id_str}). Строка пропущена. ---")
                print(f"    Ошибка: {type(e).__name__}: {e}")
                skipped_count += 1
                
        print("----------Завершение цикла comments. Попытка финального коммита...")
        try:
            db.session.commit()
            print("-" * 30)
            print(f"ИТОГ ИМПОРТА КОММЕНТАРИЕВ:")
            print(f"  Успешно импортировано/обновлено: {imported_count}")
            print(f"  Добавлено новых преподавателей: {teachers_added}")
            print(f"  Пропущено из-за ошибок/отсутствия зависимостей: {skipped_count}")
            print(f"  Всего обработано строк (до лимита): {last_idx + 1}")
            print("-" * 30)
        except Exception as e:
             print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при финальном коммите комментариев: {e}")
             db.session.rollback()


def import_submissions(limit=2000000):
    print(f"----------Начало импорта submissions (лимит: {limit})...")
    imported_count = 0
    skipped_count = 0
    last_idx = 0

    print("----------Предзагрузка существующих ID пользователей и шагов...")
    existing_user_ids = {u.user_id for u in db.session.query(Learner.user_id).all()}
    existing_step_ids = {s.step_id for s in db.session.query(Step.step_id).all()}
    print(f"----------Загружено {len(existing_user_ids)} user ID и {len(existing_step_ids)} step ID.")

    with open('backend/submissions.csv', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader) # Пропуск заголовка
        for idx, item in enumerate(reader):
            last_idx = idx
            if idx >= limit:
                print(f"----------Достигнут лимит импорта ({limit}).")
                break
                
            if idx > 0 and idx % 10000 == 0:
                print(f"----------Обработано {idx} строк из submissions.csv...")

            submission_id_str = item[0]
            try:
                # Парсинг
                step_id = int(item[1])
                user_id = int(item[2])
                score_str = item[8]
                
                # Проверка существования user и step по предзагруженным ID
                if user_id not in existing_user_ids:
                    # print(f"--- ПРОПУСК submission {submission_id_str}: Пользователь {user_id} не найден.")
                    skipped_count += 1
                    continue 
                if step_id not in existing_step_ids:
                    # print(f"--- ПРОПУСК submission {submission_id_str}: Шаг {step_id} не найден.")
                    skipped_count += 1
                    continue 

                # Создание объекта
                new_entry = Submission(
                    submission_id=int(submission_id_str),
                    step_id=step_id,
                    user_id=user_id,
                    attempt_time=parse_datetime(item[5]),
                    submission_time=parse_datetime(item[6]),
                    status=item[7],
                    # score=float(score_str) if score_str else None, # Использовать float?
                    score=int(float(score_str)) if score_str else None, # Или int? Проверьте ваши данные score
                )
                # Добавление/обновление
                db.session.merge(new_entry)
                imported_count += 1

            except Exception as e:
                db.session.rollback() # Откат для этой строки
                print(f"--- ОШИБКА при обработке строки {idx+1} (Submission ID: {submission_id_str}). Строка пропущена. ---")
                print(f"    Ошибка: {type(e).__name__}: {e}")
                skipped_count += 1

    # Финальный коммит
    print("----------Завершение цикла submissions. Попытка финального коммита...")
    try:
        db.session.commit()
        print("-" * 30)
        print(f"ИТОГ ИМПОРТА SUBMISSIONS:")
        print(f"  Успешно импортировано/обновлено: {imported_count}")
        print(f"  Пропущено из-за ошибок/отсутствия зависимостей: {skipped_count}")
        print(f"  Всего обработано строк (до лимита): {last_idx + 1}")
        print("-" * 30)
    except Exception as e:
         print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при финальном коммите submissions: {e}")
         db.session.rollback()

# --- Основной блок для запуска импорта ---
if __name__ == '__main__':
    print("="*40)
    print("ЗАПУСК СКРИПТА НАПОЛНЕНИЯ БАЗЫ ДАННЫХ")
    print("="*40)
    
    # Создаем БД если ее нет (используя данные из app.config неявно)
    # Убедитесь, что имя БД совпадает с тем, что в app.config['SQLALCHEMY_DATABASE_URI']
    db_name = app.config['SQLALCHEMY_DATABASE_URI'].split('/')[-1].split('?')[0] 
    db_user = app.config['SQLALCHEMY_DATABASE_URI'].split('//')[1].split(':')[0]
    db_pass = app.config['SQLALCHEMY_DATABASE_URI'].split(':')[2].split('@')[0]
    db_host = app.config['SQLALCHEMY_DATABASE_URI'].split('@')[1].split('/')[0]
    create_database_if_not_exists(db_name, user=db_user, password=db_pass, host=db_host)

    # Используем контекст приложения Flask для доступа к db и настройкам
    with app.app_context():
        print("\n----------Создание/проверка таблиц...")
        db.create_all() # Создает таблицы, если их нет (безопасно)
        
        print("\n----------Начало импорта данных...")
        
        # Вызов функций импорта в правильном порядке зависимостей
        import_learners()
        import_structure() 
        # Только после learners и structure можно импортировать comments и submissions
        import_comments()
        import_submissions()
        
        print("\n----------ИМПОРТ ДАННЫХ ЗАВЕРШЕН.")
        print("="*40)
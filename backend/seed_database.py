import csv
import sys
import pymysql
from datetime import datetime
import pandas as pd
import math
import os

# Импортируем app для контекста, db и Модели
# Предполагается, что database.py и models.py находятся в той же папке backend
from backend.database import app, create_database_if_not_exists 
from backend.models import db, Course, Module, Lesson, Step, Learner, Submission, Comment, AdditionalStepInfo, enrollment_table
from sqlalchemy.exc import IntegrityError
import argparse

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


def import_learners(course_data_path, limit=500000):
    print(f"----------Начало импорта learners (лимит: {limit})...")
    learners_csv_path = os.path.join(course_data_path, 'learners.csv')
    print(f"----------Чтение файла: {learners_csv_path}")
    imported_count = 0
    skipped_count = 0
    last_idx = 0
    imported_ids = set()
    try:
        with open(learners_csv_path, newline='', encoding='utf-8') as f:
            reader = csv.reader(f); next(reader) # Пропуск заголовка
            for idx, item in enumerate(reader):
                last_idx = idx
                if idx >= limit: print(f"----------Достигнут лимит импорта ({limit})."); break
                if idx > 0 and idx % 10000 == 0: print(f"----------Обработано {idx} строк learners...")

                learner_id_str = item[0]
                try:
                    learner_id = int(learner_id_str)
                    new_entry = Learner(
                        user_id=learner_id, last_name=item[1], first_name=item[2],
                        last_login=parse_datetime(item[3]), data_joined=parse_datetime(item[4]),
                    )
                    db.session.merge(new_entry)
                    imported_ids.add(learner_id) # Добавляем ID в set
                    imported_count += 1
                except Exception as e:
                    db.session.rollback()
                    print(f"--- ОШИБКА learners строка {idx+1} (ID: {learner_id_str}): {e}"); skipped_count += 1

        print("----------Коммит learners..."); db.session.commit()
    except FileNotFoundError: print(f"!!! ОШИБКА: Файл {learners_csv_path} не найден!"); return set() # Возвращаем пустой set
    except Exception as e: print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при импорте learners: {e}"); db.session.rollback(); return set()
    finally: # Итоговый отчет
        print("-" * 30)
        print(f"ИТОГ ИМПОРТА LEARNERS:")
        print(f"  Импорт/обновлено: {imported_count}")
        print(f"  Пропущено: {skipped_count}")
        print(f"  Всего строк: {last_idx + 1}")
        print("-" * 30)

    return imported_ids


def import_structure(course_data_path, limit=10000000):
    """Импортирует структуру, создает курс и возвращает ID найденного курса."""
    print(f"----------Начало импорта structure (лимит: {limit})...")
    structure_csv_path = os.path.join(course_data_path, 'structure.csv')
    print(f"----------Чтение файла: {structure_csv_path}")
    courses_count, modules_count, lessons_count, steps_count = 0, 0, 0, 0
    skipped_count = 0
    last_idx = 0
    processed_courses = set(); processed_modules = set(); processed_lessons = set(); processed_steps = set()
    first_course_id_found = None # <--- Переменная для хранения первого найденного ID курса

    try: # Обернем весь импорт структуры
        with open(structure_csv_path, newline='', encoding='utf-8') as f:
            reader = csv.reader(f)
            try: header = next(reader)
            except StopIteration: print("!!! ОШИБКА: Файл structure.csv пуст."); return None

            # Ищем индекс колонки course_id
            course_id_index = -1
            try: course_id_index = header.index('course_id') # Простой поиск по точному имени
            except ValueError:
                 # Пытаемся найти регистронезависимо
                 for i, col_name in enumerate(header):
                     if col_name.strip().lower() == 'course_id': course_id_index = i; break
            if course_id_index == -1:
                print(f"!!! КРИТИЧЕСКАЯ ОШИБКА: Колонка 'course_id' не найдена в structure.csv. Заголовок: {header}"); return None

            # Получаем остальные индексы (можно добавить проверки)
            module_id_index = header.index('module_id'); module_pos_index = header.index('module_position')
            lesson_id_index = header.index('lesson_id'); lesson_pos_index = header.index('lesson_position')
            step_id_index = header.index('step_id'); step_pos_index = header.index('step_position')
            step_type_index = header.index('step_type'); step_cost_index = header.index('step_cost')

            print(f"---------- Заголовок structure.csv распознан (course_id в колонке {course_id_index}). Обработка строк...")
            for idx, item in enumerate(reader):
                last_idx = idx
                if idx >= limit: print(f"---------- Достигнут лимит импорта ({limit})."); break
                if idx > 0 and idx % 10000 == 0: print(f"---------- Обработано {idx} строк structure...")

                try:
                    course_id = int(item[course_id_index])
                    # ---> СОХРАНЯЕМ ПЕРВЫЙ НАЙДЕННЫЙ ID <---
                    if first_course_id_found is None:
                        first_course_id_found = course_id
                        print(f"---------- Обнаружен ID курса для этого импорта: {first_course_id_found}")

                    module_id = int(item[module_id_index])
                    lesson_id = int(item[lesson_id_index])
                    step_id = int(item[step_id_index])

                    # 1. Создаем/находим курс
                    if course_id not in processed_courses:
                        course_title = f"Курс {course_id}" # Простое название
                        new_course = Course(course_id=course_id, title=course_title)
                        db.session.merge(new_course); processed_courses.add(course_id); courses_count += 1

                    # 2. Создаем/находим модуль и связываем с курсом
                    if module_id not in processed_modules:
                        new_module = Module(module_id=module_id, module_position=int(item[module_pos_index]), course_id=course_id)
                        db.session.merge(new_module); processed_modules.add(module_id); modules_count += 1

                    # 3. Создаем/находим урок
                    if lesson_id not in processed_lessons:
                        new_lesson = Lesson(lesson_id=lesson_id, lesson_position=int(item[lesson_pos_index]), module_id=module_id)
                        db.session.merge(new_lesson); processed_lessons.add(lesson_id); lessons_count += 1

                    # 4. Создаем/находим шаг
                    if step_id not in processed_steps:
                        step_cost_str = item[step_cost_index]; step_type_str = item[step_type_index]
                        new_step = Step(
                            step_id=step_id, step_position=int(item[step_pos_index]),
                            step_type=step_type_str if step_type_str else None,
                            step_cost=int(step_cost_str) if step_cost_str else None,
                            lesson_id=lesson_id)
                        db.session.merge(new_step); processed_steps.add(step_id); steps_count += 1

                except (IndexError, ValueError) as e:
                    db.session.rollback()
                    print(f"--- ОШИБКА structure строка {idx+1}: {e} (данные: {item})"); skipped_count += 1
                except Exception as e:
                    db.session.rollback()
                    print(f"--- НЕИЗВЕСТНАЯ ОШИБКА structure строка {idx+1}: {e}"); skipped_count += 1

        print("----------Коммит structure..."); db.session.commit()

    except FileNotFoundError: print("!!! ОШИБКА: Файл backend/structure.csv не найден!"); return None # Возвращаем None, если файла нет
    except Exception as e: print(f"!!! КРИТИЧЕСКАЯ ОШИБКА structure: {e}"); db.session.rollback(); return None # Возвращаем None при других критических ошибках
    finally: # Итоговый отчет
        print("-" * 30)
        print(f"ИТОГ ИМПОРТА STRUCTURE:")
        print(f"  Успешно уник.: Курсов={courses_count}, Модулей={modules_count}, Уроков={lessons_count}, Шагов={steps_count}")
        print(f"  Пропущено: {skipped_count}")
        print(f"  Всего строк: {last_idx + 1}")
        print("-" * 30)

    # ---> ВОЗВРАЩАЕМ НАЙДЕННЫЙ ID КУРСА <---
    return first_course_id_found


def enroll_learners_to_course(target_course_id, learner_ids_to_enroll):
    """Зачисляет учеников с УКАЗАННЫМИ ID на курс с УКАЗАННЫМ ID."""
    if target_course_id is None: print("!!! ОШИБКА ЗАЧИСЛЕНИЯ: Не передан ID курса."); return
    if not learner_ids_to_enroll: print(f"--- ПРЕДУПРЕЖДЕНИЕ: Не переданы ID учеников для зачисления на курс {target_course_id}. Зачисление пропущено."); return

    print(f"---------- Начало зачисления {len(learner_ids_to_enroll)} учеников на курс ID={target_course_id} ---")
    try:
        course = db.session.get(Course, target_course_id)
        if not course: print(f"!!! ОШИБКА: Курс с ID={target_course_id} не найден."); return

        # Получаем ТОЛЬКО тех учеников из списка, кто есть в БД
        learners_in_db = db.session.query(Learner).filter(Learner.user_id.in_(learner_ids_to_enroll)).all()
        actual_learner_ids_in_db = {l.user_id for l in learners_in_db}
        missing_ids = learner_ids_to_enroll - actual_learner_ids_in_db
        if missing_ids: print(f"--- ПРЕДУПРЕЖДЕНИЕ: ID не найдены в таблице Learner и не будут зачислены: {missing_ids}")
        if not learners_in_db: print("--- ПРЕДУПРЕЖДЕНИЕ: Ни один из переданных учеников не найден в БД."); return

        # Получаем существующие зачисления для ЭТИХ учеников на ЭТОТ курс
        existing_enrollments = {row[0] for row in db.session.query(enrollment_table.c.learner_id).filter(
            enrollment_table.c.course_id == target_course_id,
            enrollment_table.c.learner_id.in_(actual_learner_ids_in_db)
        ).all()}
        print(f"--- Найдено {len(existing_enrollments)} существующих зачислений для этой группы на курс {target_course_id}.")

        enrolled_count, already_enrolled_count, error_count = 0, 0, 0
        for learner in learners_in_db: # Итерируем по найденным в БД
            if learner.user_id not in existing_enrollments:
                try:
                    enrollment_insert = enrollment_table.insert().values(learner_id=learner.user_id, course_id=course.course_id)
                    db.session.execute(enrollment_insert); enrolled_count += 1
                except IntegrityError: db.session.rollback(); already_enrolled_count += 1
                except Exception as e: db.session.rollback(); print(f"!!! Ошибка зачисления user {learner.user_id}: {e}"); error_count += 1
            else: already_enrolled_count += 1

        print("----------Коммит зачислений..."); db.session.commit()

    except Exception as e: print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при зачислении: {e}"); db.session.rollback()
    finally: # Итоговый отчет
        print("-" * 30)
        print(f"ИТОГ ЗАЧИСЛЕНИЯ НА КУРС {target_course_id}:")
        print(f"  Новых: {enrolled_count}")
        print(f"  Уже были/Integrity: {already_enrolled_count}")
        print(f"  Другие ошибки: {error_count}")
        print("-" * 30)


def import_comments(course_data_path, limit=300000):
    print(f"----------Начало импорта комментариев (лимит: {limit})...")
    comments_csv_path = os.path.join(course_data_path, 'comments.csv')
    print(f"----------Чтение файла: {comments_csv_path}")
    with open(comments_csv_path, newline='', encoding='utf-8') as f:
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

                new_comment = Comment(
                    comment_id=comment_id,
                    user_id=user_id,
                    step_id=step_id,
                    parent_comment_id=parent_comment_id,
                    time=time_val,
                    deleted=deleted_val,
                    text_clear=text_val)
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


def import_submissions(course_data_path, limit=30000000):
    print(f"----------Начало импорта submissions (лимит: {limit})...")
    submissions_csv_path = os.path.join(course_data_path, 'submissions.csv')
    print(f"----------Чтение файла: {submissions_csv_path}")
    imported_count = 0
    skipped_count = 0
    last_idx = 0

    print("----------Предзагрузка существующих ID пользователей и шагов...")
    existing_user_ids = {u.user_id for u in db.session.query(Learner.user_id).all()}
    existing_step_ids = {s.step_id for s in db.session.query(Step.step_id).all()}
    print(f"----------Загружено {len(existing_user_ids)} user ID и {len(existing_step_ids)} step ID.")

    with open(submissions_csv_path, newline='', encoding='utf-8') as f:
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


def import_additional_info(course_data_path, excel_filename='AdditionalInfo.xlsx'):
    """
    Импортирует доп. данные для шагов из Excel (ФОРМАТ с 26.07).
    СНАЧАЛА УДАЛЯЕТ ВСЕ СТАРЫЕ ЗАПИСИ из таблицы additional_step_info.
    Читает по ИНДЕКСАМ колонок (E=4, I=8, J=9, K=10, L=11, M=12).
    """
    additional_info_path = os.path.join(course_data_path, excel_filename)
    print(f"--- Начало импорта доп. информации из {additional_info_path} (ФОРМАТ с 26.07)...")

    try:


        # Читаем Excel, пропуская 8 строк заголовков (данные с 9-й строки)
        df = pd.read_excel(additional_info_path, header=None, skiprows=8)

        # --- ОПРЕДЕЛЯЕМ ИНДЕКСЫ КОЛОНОК (0-based в pandas) ---
        # E=4, I=8, J=9, K=10, L=11, M=12
        STEP_ID_IDX = 5           # Колонка E
        TITLE_SHORT_IDX = 8       # Колонка I  <-- ИЗМЕНЕНО
        TITLE_FULL_IDX = 9        # Колонка J  <-- ИЗМЕНЕНО
        VIEWS_IDX = 13            # Колонка K  <-- ИЗМЕНЕНО
        UNIQUE_VIEWS_IDX = 14     # Колонка L  <-- ИЗМЕНЕНО
        PASSED_IDX = 15           # Колонка M  <-- ИЗМЕНЕНО
        # PASSED_CORRECTLY_IDX больше не нужен
        # -----------------------------------------

        # Проверяем, достаточно ли колонок
        max_required_index = max(STEP_ID_IDX, TITLE_SHORT_IDX, TITLE_FULL_IDX, VIEWS_IDX, UNIQUE_VIEWS_IDX, PASSED_IDX)
        if df.shape[1] <= max_required_index:
            print(f"ОШИБКА: В файле {additional_info_path} недостаточно колонок ({df.shape[1]}) для чтения по максимальному требуемому индексу ({max_required_index}).")
            return

        count = 0
        skipped_steps_no_match = 0
        skipped_rows_error = 0

        print("--- Обработка строк из Excel...")
        # Итерируем по строкам DataFrame
        for index, row in df.iterrows():
            excel_row_num = index + 9
            try:
                # Получаем step_id (колонка E, индекс 4)
                step_id_raw = row[STEP_ID_IDX]
                if pd.isna(step_id_raw):
                    skipped_rows_error += 1; continue
                step_id = int(step_id_raw)

            except (ValueError, TypeError, IndexError):
                print(f"--- ОШИБКА: Не удалось получить step_id (индекс {STEP_ID_IDX}) в строке {excel_row_num}. Значение: '{row.get(STEP_ID_IDX, 'N/A')}'. Строка пропущена.")
                skipped_rows_error += 1; continue

            # Проверяем, существует ли шаг
            step_exists = db.session.get(Step, step_id)
            if not step_exists:
                skipped_steps_no_match += 1; continue

            try:
                # --- Получаем остальные данные по ИНДЕКСАМ ---
                title_short_raw = row[TITLE_SHORT_IDX]
                title_full_raw = row[TITLE_FULL_IDX]
                views_raw = row[VIEWS_IDX]
                unique_views_raw = row[UNIQUE_VIEWS_IDX]
                passed_raw = row[PASSED_IDX]
                # passed_correctly_raw больше не нужен
                # ---------------------------------------------

                # Функции конвертации (без изменений)
                def safe_int(val):
                    if pd.isna(val) or (isinstance(val, float) and math.isnan(val)) or str(val).strip() == '': return None
                    try: return int(float(val))
                    except (ValueError, TypeError): return None
                def safe_str(val):
                    if pd.isna(val): return None
                    return str(val)

                # Создаем объект AdditionalStepInfo с НОВЫМИ полями
                new_entry = AdditionalStepInfo(
                    step_id=step_id,
                    step_title_short=safe_str(title_short_raw),   # Колонка I
                    step_title_full=safe_str(title_full_raw),    # Колонка J
                    views=safe_int(views_raw),                   # Колонка K
                    unique_views=safe_int(unique_views_raw),     # Колонка L
                    passed=safe_int(passed_raw)                  # Колонка M
                    # passed_correctly больше не нужен
                )
                db.session.merge(new_entry)
                count += 1

            except (IndexError, ValueError, TypeError) as data_err:
                 print(f"--- ОШИБКА данных в строке {excel_row_num} для step_id {step_id}: {data_err}. Строка пропущена.")
                 skipped_rows_error += 1
                 db.session.rollback()
            except Exception as merge_err:
                 db.session.rollback()
                 print(f"--- Ошибка при merge доп. инфо для step_id {step_id} (строка {excel_row_num}): {merge_err}")
                 skipped_rows_error += 1

        # Финальный коммит ПОСЛЕ цикла
        print("----------Коммит доп. инфо...")
        try:
            db.session.commit()
        except Exception as e:
             print(f"!!! КРИТИЧЕСКАЯ ОШИБКА при финальном коммите доп. инфо: {e}")
             db.session.rollback()

        # Итоговый отчет (без изменений)
        print(f"---------- Импортировано/обновлено доп. инфо: {count} записей.")
        if skipped_steps_no_match > 0: print(f"---------- Пропущено (нет шага в БД): {skipped_steps_no_match} записей.")
        if skipped_rows_error > 0: print(f"---------- Пропущено строк из-за ошибок чтения/формата: {skipped_rows_error}.")

    except FileNotFoundError: print(f"!!! ОШИБКА: Файл {additional_info_path} не найден.")
    except Exception as e:
        print(f"!!! НЕПРЕДВИДЕННАЯ ОШИБКА при чтении/обработке файла {additional_info_path}: {e}")
        db.session.rollback()

# --- Основной блок для запуска импорта ---
if __name__ == '__main__':
    
    parser = argparse.ArgumentParser(description='Seed database from course data folder.')
    parser.add_argument('course_folder', type=str, help='Path to the course data folder (e.g., backend/Courses_data/course2)')
    args = parser.parse_args()
    # Используем нормализованный абсолютный путь
    COURSE_DATA_PATH = os.path.abspath(args.course_folder)
    print(f"\nИспользуется папка с данными курса: {COURSE_DATA_PATH}")
    if not os.path.isdir(COURSE_DATA_PATH):
        print(f"!!! ОШИБКА: Указанный путь не является директорией: {COURSE_DATA_PATH}")
        sys.exit(1)
    
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
        #current_learner_ids = import_learners(course_data_path=COURSE_DATA_PATH)
        #imported_course_id = import_structure(course_data_path=COURSE_DATA_PATH)

        #if imported_course_id is not None:
        #    enroll_learners_to_course(
        #        target_course_id=imported_course_id,
        #        learner_ids_to_enroll=current_learner_ids # Передаем ID
        #    )
        #else: print("!!! Импорт структуры не вернул ID курса. Зачисление пропущено.")

        import_additional_info(course_data_path=COURSE_DATA_PATH) # Используем имя файла по умолчанию
        #import_comments(course_data_path=COURSE_DATA_PATH)
        #import_submissions(course_data_path=COURSE_DATA_PATH)

        print("\n----------ИМПОРТ ДАННЫХ ЗАВЕРШЕН.")
        print("="*40)
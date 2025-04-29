Данные для бд (https://drive.google.com/file/d/1Frg0vmeY2bAvoQ7pOhsQTkqjqCyxNX7m/view)
Егор, когда будешь запускать фронетнд в VisualStudioCode или где ты там сидишь напиши(в терминале), cd frontend(Enter), npm i(Enter) 

обработанные данные для heidisql (https://drive.google.com/file/d/1OZSmsLN1cAY7TjPJQw_3gmiB8zjvvHqV/view?usp=sharing)

Артем, скачай отсюда два курса (https://drive.google.com/file/d/1HhVYUuAiGUO54yjR2RxcYjVkNd76XDn3/view?usp=sharing), создай папку
DevAppForAnalytCourseVKR\backend\Courses_data, сюда закинь скачанные папки, также создай папку course1, туда закнь наши основные
csv файлы (самые большие которые)
Когда сделаешь, заходи в консоли в корень (DevAppForAnalytCourseVKR\), пиши по очереди:
python -m backend.seed_database backend/Courses_data/course2
python -m backend.seed_database backend/Courses_data/course3
У тебя все заполнится данными (там нет AdditionalInfo, будет позже)
Далее читай ридми в бекенде (теперь все что расчитывается в кеш сохраняется в папке соответствующей)

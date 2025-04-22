

export const csvExamples = {
    learners: {
        title: 'Пример: Learners (learners.csv)',
        headers: ['user_id', 'last_name', 'first_name', 'last_login_utc', 'date_joined_utc'],
        rows: [
            ['202765182', 'Денежкина', 'Алина', '2024-01-23 09:02:07+00:00', '2020-04-01 02:52:08+00:00'],
            ['81749043', 'Лень', 'Никита', '2024-07-27 15:25:57+00:00', '2020-04-01 03:04:07+00:00'],
            ['142302885', 'Хен', 'Александра', '2024-06-27 09:54:03+00:00', '2020-04-01 03:14:43+00:00'],
        ]
    },
    structure: {
        title: 'Пример: Structure (structure.csv)',
        headers: ['course_id', 'module_id', 'module_position', 'lesson_id', 'lesson_position', 'step_id', 'step_position', 'step_type', 'step_cost', 'begin_date_utc', 'end_date_utc'],
        rows: [
            ['63054', '112676', '1', '297588', '1', '1037221', '1', 'text', '0', '1664114400', '...'],
            ['63054', '112676', '1', '297588', '1', '1160912', '2', 'text', '0', '1664114400', '...'],
            ['63054', '112676', '1', '297588', '1', '1042589', '5', 'table', '1', '1664114400', '...'],
        ]
    },
    submissions: {
        title: 'Пример: Submissions (submissions.csv)',
        headers: ['submission_id', 'step_id', 'user_id', 'last_name', 'first_name', 'attempt_time_utc', 'submission_time_utc', 'status', 'score'],
        rows: [
            ['160696187', '1032497', '139034823', 'Озерова', 'Галина', '1579063234', '1579063254', 'wrong', '0.0'],
            ['160696585', '1032504', '139034823', 'Озерова', 'Галина', '1579063265', '1579063269', 'correct', '1.0'],
            ['160700777', '1032504', '139034823', 'Озерова', 'Галина', '1579065508', '1579065510', 'correct', '1.0'],
        ]
    },
    comments: {
        title: 'Пример: Comments (comments.csv)',
        headers: ['comment_id', 'user_id', 'last_name', 'first_name', 'step_id', 'parent_comment_id', 'time_utc', 'deleted', 'text_clear'],
        rows: [
            ['1537971', '159673175', 'Баськов', 'Андрей', '1042705', '0', '1585927554', 'False', '<p>После названия таблицы можно...'],
            ['1539394', '139034823', 'Озерова', 'Галина', '1042705', '1537971', '1585959320', 'False', '<p><strong>@Андрей Баськов</strong>...</p>'],
            ['1540314', '311125', 'Зародышев', 'Александр', '1067571', '0', '1585995281', 'False', '<p>Уважаемые авторы, а можно ли...'],
        ]
    }
};
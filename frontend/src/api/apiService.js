// src/api/apiService.js
import { mockMetrics, generateMockStepData } from '../mocks/mockData'; // Используем моки для имитации некоторых API

// Определяем базовый URL для API. Лучше использовать переменную окружения.
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

/**
 * Общая функция-обертка для выполнения fetch-запросов к API.
 * @param {string} endpoint - Путь к API эндпоинту (например, '/metrics/course/completion_rate').
 * @param {object} options - Опции для fetch (method, headers, body и т.д.).
 * @returns {Promise<any>} - Промис с JSON-ответом сервера.
 * @throws {Error} - Выбрасывает ошибку при неудачном запросе.
 */
const request = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        // По умолчанию используем GET, если метод не указан
        method: options.method || 'GET',
        ...options, // Перезаписываем метод, если он есть в options
        headers: {
            // Устанавливаем Content-Type для JSON по умолчанию,
            // если тело запроса не FormData
            ...(options.body && !(options.body instanceof FormData) && {
                'Content-Type': 'application/json',
            }),
            ...options.headers, // Позволяем перезаписать заголовки из options
        },
    };

    // Если тело - объект и не FormData, преобразуем в JSON
    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }

    try {
        console.log(`API Request: ${config.method} ${url}`); // Логгируем запрос
        const response = await fetch(url, config);

        // Обработка ответа без тела (например, для DELETE или статуса 204)
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            console.log(`API Response: ${response.status} (No Content)`);
            return null; // или return { success: true }; в зависимости от логики
        }

        // Попытка получить JSON из ответа
        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            // Если тело ответа не JSON, но статус ok (200-299), вернем как есть
             if (response.ok) {
                 console.warn(`API Response: ${response.status}, but body is not JSON.`);
                 // Возможно, стоит вернуть response.text() или что-то другое
                 return null;
             }
            // Если статус не ok и тело не JSON, создаем объект ошибки
            console.error("API Error: Failed to parse JSON response body.", e);
            throw new Error(`HTTP error! status: ${response.status}, Body is not valid JSON.`);
        }

        // Проверка статуса ответа ПОСЛЕ получения JSON
        if (!response.ok) {
            console.error("API Error Response:", responseData);
             // Используем сообщение из ответа сервера, если оно есть, иначе стандартное
            throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
        }

        console.log(`API Response: ${response.status}`, responseData); // Логгируем успешный ответ
        return responseData;

    } catch (error) {
        // Логгируем ошибку сети или ошибку, выброшенную выше
        console.error('API call failed:', error.message || error);
        // Пробрасываем ошибку дальше для обработки в компоненте
        throw error;
    }
};

// --- Функции для Эндпоинтов Метрик ---

/**
 * Получение общей результативности курса.
 * @returns {Promise<{course_completion_rate: number, users_completed: number, total_learners: number, total_steps_in_course: number}>}
 */
export const getCourseCompletionRate = () => {
    // Примечание: Текущий бэкенд эндпоинт считает по всей БД.
    // В будущем может потребоваться передавать courseId.
    return request(`/metrics/course/completion_rate`);
};

/**
 * Получение количества пользователей, прошедших шаг, и общее количество приступивших.
 * @param {number|string} stepId - ID шага.
 * @returns {Promise<{step_id: number, users_passed: number, all_users: number}>}
 */
export const getUsersPassedStep = (stepId) => {
    return request(`/metrics/step/${stepId}/users_passed`);
};

/**
 * Получение результативности шага (Прошедшие / Приступившие).
 * @param {number|string} stepId - ID шага.
 * @returns {Promise<{step_id: number, step_effectiveness: number}>}
 */
export const getStepEffectiveness = (stepId) => {
    return request(`/metrics/step/${stepId}/effectiveness`);
};

/**
 * Получение среднего времени прохождения шага до первого верного ответа (сек).
 * @param {number|string} stepId - ID шага.
 * @returns {Promise<{step_id: number, avg_completion_time_seconds: number | null}>}
 */
export const getAvgCompletionTime = (stepId) => {
    return request(`/metrics/step/${stepId}/avg_completion_time`);
};

/**
 * Получение процента успеха попыток на шаге (верные / все).
 * @param {number|string} stepId - ID шага.
 * @returns {Promise<{step_id: number, success_rate: number}>}
 */
export const getStepSuccessRate = (stepId) => {
    return request(`/metrics/step/${stepId}/success_rate`);
};

/**
 * Получение среднего числа попыток на пользователя, успешно прошедшего шаг.
 * @param {number|string} stepId - ID шага.
 * @returns {Promise<{step_id: number, avg_attempts_per_passed_user: number | null}>}
 */
export const getAvgAttemptsPerPassed = (stepId) => {
    return request(`/metrics/step/${stepId}/avg_attempts`);
};

/**
 * Получение количества комментариев к шагу.
 * @param {number|string} stepId - ID шага.
 * @returns {Promise<{step_id: number, comments_count: number}>}
 */
export const getStepCommentsCount = (stepId) => {
    return request(`/metrics/step/${stepId}/comments_count`);
};


// --- ЗАГЛУШКИ для НЕ РЕАЛИЗОВАННЫХ ЭНДПОИНТОВ Управления Курсами и Агрегации ---

/**
 * Получение данных по всем шагам курса для дашборда.
 * ЗАГЛУШКА: Требуется реализация эндпоинта на бэкенде.
 * @param {string} decodedCourseId - Декодированный ID курса.
 * @returns {Promise<Array<object>>} - Массив объектов с данными по шагам.
 */
export const getAllStepMetricsForCourse = (decodedCourseId) => {
    console.warn(`getAllStepMetricsForCourse для ID ${decodedCourseId}: Бэкенд эндпоинт НЕ РЕАЛИЗОВАН! Возвращаются Mock данные.`);
    // TODO: Заменить на реальный вызов API, когда будет готов эндпоинт
    // return request(`/course/${encodeURIComponent(decodedCourseId)}/steps_metrics`);
    // Имитация ответа API с использованием mock-данных
    return Promise.resolve(generateMockStepData()); // Используем генератор моков
};

/**
 * Получение списка загруженных курсов.
 * ЗАГЛУШКА: Требуется реализация эндпоинта на бэкенде.
 * @returns {Promise<Array<{id: string, name: string, date: string, dashboardLink: string}>>} - Массив объектов курсов.
 */
export const getCourses = () => {
    console.warn("getCourses: Бэкенд эндпоинт НЕ РЕАЛИЗОВАН! Используется localStorage.");
    // TODO: Заменить на реальный вызов API: return request('/courses');
    // Временная заглушка, читающая из localStorage
    try {
        const stored = localStorage.getItem("uploadedCourses");
        return Promise.resolve(stored ? JSON.parse(stored) : []);
    } catch (e) {
        console.error("Ошибка чтения localStorage в getCourses:", e);
        return Promise.resolve([]);
    }
};

/**
 * Загрузка файлов курса на сервер.
 * ЗАГЛУШКА: Требуется реализация эндпоинта на бэкенде.
 * @param {FormData} formData - Объект FormData с файлами и именем курса.
 * @returns {Promise<object>} - Промис с ответом сервера (например, { id, name, message }).
 */
export const uploadCourse = (formData) => {
    console.warn("uploadCourse: Бэкенд эндпоинт НЕ РЕАЛИЗОВАН! Имитация загрузки.");
    // TODO: Заменить на реальный вызов API:
    // const courseName = formData.get('courseName');
    // const courseId = formData.get('courseId'); // Если ID генерируется на фронте и отправляется
    // return fetch(`${API_BASE_URL}/courses`, { // URL может быть другим
    //     method: 'POST',
    //     body: formData,
    // }).then(response => {
    //      if (!response.ok) throw new Error(`Ошибка загрузки: ${response.statusText}`);
    //      return response.json(); // Ожидаем ответ с ID и именем от бэкенда
    // });

    // Имитация успешного ответа для фронтенда
    const courseName = formData.get('courseName') || 'Новый курс';
    // Используем тот же ID, что и в UploadCourse для консистентности заглушки
    const courseId = formData.get('courseId') || `${encodeURIComponent(courseName)}-${Date.now()}`;
    return Promise.resolve({
        id: courseId, // Отдаем ID
        name: courseName,
        message: 'Курс (имитация) успешно загружен'
    });
};

/**
 * Удаление курса на сервере.
 * ЗАГЛУШКА: Требуется реализация эндпоинта на бэкенде.
 * @param {string} encodedCourseId - Закодированный ID курса для удаления.
 * @returns {Promise<null>} - Промис без данных в случае успеха.
 */
export const deleteCourse = (encodedCourseId) => {
     console.warn(`deleteCourse ${encodedCourseId}: Бэкенд эндпоинт НЕ РЕАЛИЗОВАН! Имитация удаления.`);
    // TODO: Заменить на реальный вызов API:
    // return request(`/courses/${encodedCourseId}`, { method: 'DELETE' });

    // Имитация успешного ответа (обычно DELETE возвращает 204 No Content)
    return Promise.resolve(null);
};

// TODO: Добавить функции для других будущих API эндпоинтов
// export const getStepAnalysis = (stepId) => {...};
// export const getComparisonData = (stepIds) => {...};
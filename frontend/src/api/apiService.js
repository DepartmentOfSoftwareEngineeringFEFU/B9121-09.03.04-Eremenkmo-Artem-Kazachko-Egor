// src/api/apiService.js

// Определяем базовый URL для API.
// Используйте переменную окружения REACT_APP_API_URL, если она задана,
// иначе fallback на http://localhost:5000/api
const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000/api";

/**
 * Общая функция-обертка для выполнения fetch-запросов к API.
 * @param {string} endpoint - Путь к API эндпоинту (например, '/metrics/steps/structure').
 * @param {object} options - Опции для fetch (method, headers, body и т.д.).
 * @returns {Promise<any>} - Промис с JSON-ответом сервера или null для ответов 204.
 * @throws {Error} - Выбрасывает ошибку при неудачном запросе или ошибке парсинга.
 */
const request = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    method: options.method || "GET",
    ...options,
    headers: {
      // Добавляем Content-Type: application/json только если есть тело
      // и это тело не является объектом FormData (который имеет свой Content-Type).
      ...(options.body &&
        !(options.body instanceof FormData) && {
          "Content-Type": "application/json",
        }),
      // Добавляем любые другие заголовки, переданные в options
      ...options.headers,
    },
  };

  // Если тело запроса - объект (не FormData), преобразуем его в JSON-строку.
  if (
    config.body &&
    typeof config.body === "object" &&
    !(config.body instanceof FormData)
  ) {
    config.body = JSON.stringify(config.body);
  }

  try {
    console.log(`API Request: ${config.method} ${url}`);
    const response = await fetch(url, config);

    // --- НАЧАЛО ИСПРАВЛЕННОЙ ЛОГИКИ ОБРАБОТКИ ОТВЕТА ---

    // 1. Проверка статуса ответа. Если не OK (не 2xx), обрабатываем как ошибку.
    if (!response.ok) {
      let errorBody = `HTTP error! status: ${response.status}`; // Сообщение по умолчанию
      let errorData = { error: errorBody }; // Объект ошибки по умолчанию

      try {
        // Пытаемся прочитать тело ошибки как текст ОДИН РАЗ.
        // Это важно, чтобы получить сообщение об ошибке от сервера (HTML или текст).
        errorBody = await response.text();
        console.error(
          `API Error Response (Status ${response.status}):`,
          errorBody.substring(0, 500)
        ); // Логгируем начало текста ошибки

        // Пытаемся разобрать полученный текст как JSON.
        // Если сервер вернул JSON с ошибкой, мы его получим.
        // Если вернул HTML или простой текст, JSON.parse выбросит ошибку.
        try {
          errorData = JSON.parse(errorBody);
        } catch (jsonParseError) {
          // Если парсинг JSON не удался, используем сам текст как сообщение об ошибке.
          errorData = {
            error: `Server returned status ${
              response.status
            }. Response body: ${errorBody.substring(0, 200)}...`,
          };
        }
      } catch (readError) {
        // Если даже чтение как текст не удалось (редко, но возможно)
        console.error(
          `API Error (Status ${response.status}): Could not read error response body.`,
          readError
        );
        errorData = {
          error: `HTTP error! status: ${response.status}. Failed to read response body.`,
        };
      }

      // Выбрасываем ошибку. Используем поле 'message' или 'error' из JSON-ответа,
      // если оно есть, иначе используем сформированное сообщение.
      throw new Error(
        errorData?.message ||
          errorData?.error ||
          `HTTP error! status: ${response.status}`
      );
    }

    // 2. Обработка успешного ответа "Нет содержимого" (204 No Content)
    // Также проверяем content-length на всякий случай.
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      console.log(`API Response: ${response.status} (No Content)`);
      return null; // Успешно, но данных нет
    }

    // 3. Если ответ OK (2xx) и есть тело, пытаемся парсить как JSON.
    try {
      // Читаем тело ответа как JSON ОДИН РАЗ.
      const responseData = await response.json();
      console.log(`API Response: ${response.status}`, responseData);
      return responseData; // Возвращаем успешные данные
    } catch (jsonError) {
      // Если парсинг JSON не удался, хотя статус был OK (2xx).
      // Это может случиться, если сервер вернул некорректный JSON.
      console.error(
        `API Error: Status ${response.status} OK, but failed to parse JSON response body.`,
        jsonError
      );
      // Тело уже прочитано (или повреждено), мы не можем его прочитать снова как текст.
      // Выбрасываем новую, более понятную ошибку для этого случая.
      throw new Error(
        `Server returned status ${response.status}, but the response body was not valid JSON.`
      );
    }

    // --- КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ ОБРАБОТКИ ОТВЕТА ---
  } catch (error) {
    // Ловим ошибки сети (fetch не смог выполниться) или ошибки, выброшенные из блоков выше.
    console.error("API call failed:", error.message || error);
    // Перебрасываем ошибку дальше, чтобы ее можно было обработать в компоненте React (например, в блоке catch).
    throw error;
  }
};

// --- Функции для конкретных API эндпоинтов ---

/**
 * Получение структуры ВСЕХ шагов (включая доп. инфо и связи).
 * @returns {Promise<Array<object>>} - Массив объектов с данными по всем шагам.
 */
export const getStepsStructure = (courseId = null) => {
  let endpoint = `/metrics/steps/structure`;
  if (courseId !== null && courseId !== undefined) {
    endpoint += `?course_id=${courseId}`;
  }
  return request(endpoint);
};

/**
 * Получение ВСЕХ метрик и доп. инфо для ОДНОГО шага (оптимизированная версия).
 * @param {number|string} stepId - ID шага.
 * @returns {Promise<object>} - Объект с метриками и информацией для шага.
 */
export const getAllStepMetrics = (stepId) => {
  return request(`/metrics/step/${stepId}/all_opti`); // Используем оптимизированный эндпоинт
};

/**
 * Получение ПРЕДВАРИТЕЛЬНО РАССЧИТАННОЙ результативности курса по диапазонам.
 * @returns {Promise<object>} - Объект с данными расчета по диапазонам.
 */
export const getCourseCompletionRates = () => {
  return request(`/metrics/course/completion_rates`);
};

/**
 * Получение ПРЕДВАРИТЕЛЬНО РАССЧИТАННОГО списка преподавателей.
 * @returns {Promise<Array<object>>} - Массив объектов преподавателей.
 */
export const getTeachers = () => {
  return request("/metrics/teachers");
};

// --- ЗАГЛУШКИ для НЕ РЕАЛИЗОВАННЫХ ЭНДПОИНТОВ Управления Курсами ---
// (Оставляем их пока без изменений, т.к. бэкенд для них не готов)

/**
 * Получение списка "загруженных" курсов из localStorage.
 * ЗАГЛУШКА: Требуется реализация эндпоинта на бэкенде для реальной работы.
 * @returns {Promise<Array<{id: string, name: string, date: string, dashboardLink: string}>>}
 */
export const getCourses = () => {
  console.warn(
    "getCourses: Бэкенд эндпоинт НЕ РЕАЛИЗОВАН! Используется localStorage."
  );
  try {
    const stored = localStorage.getItem("uploadedCourses");
    return Promise.resolve(stored ? JSON.parse(stored) : []);
  } catch (e) {
    console.error("Ошибка чтения localStorage в getCourses:", e);
    // В случае ошибки парсинга localStorage, возвращаем пустой массив
    localStorage.removeItem("uploadedCourses"); // Очищаем невалидные данные
    return Promise.resolve([]);
  }
};

/**
 * Имитация загрузки файлов курса на сервер.
 * ЗАГЛУШКА: Требуется реализация эндпоинта на бэкенде для реальной работы.
 * @param {FormData} formData - Объект FormData с файлами и именем курса.
 * @returns {Promise<object>} - Имитация ответа сервера.
 */
export const uploadCourse = (formData) => {
  console.warn(
    "uploadCourse: Бэкенд эндпоинт НЕ РЕАЛИЗОВАН! Имитация загрузки."
  );
  // Имитация успешного ответа, используя данные из FormData
  const courseName = formData.get("courseName") || "Новый курс";
  const courseId =
    formData.get("courseId") ||
    `${encodeURIComponent(courseName)}-${Date.now()}`; // Используем ID из FormData, если есть
  return Promise.resolve({
    id: courseId,
    name: courseName,
    message: "Курс (имитация) успешно загружен",
  });
};

/**
 * Имитация удаления курса на сервере.
 * ЗАГЛУШКА: Требуется реализация эндпоинта на бэкенде для реальной работы.
 * @param {string} encodedCourseId - Закодированный ID курса для удаления (как хранится в localStorage).
 * @returns {Promise<null>} - Имитация успешного ответа (null для DELETE).
 */
export const deleteCourse = (encodedCourseId) => {
  console.warn(
    `deleteCourse ${encodedCourseId}: Бэкенд эндпоинт НЕ РЕАЛИЗОВАН! Имитация удаления.`
  );
  // В реальном приложении здесь был бы вызов:
  // return request(`/courses/${encodedCourseId}`, { method: 'DELETE' });
  return Promise.resolve(null); // Имитация успеха
};

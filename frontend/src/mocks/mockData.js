// src/mocks/mockData.js

// --- Вспомогательные функции для генерации ---
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  function getRandomFloat(min, max, decimals = 2) {
    const str = (Math.random() * (max - min) + min).toFixed(decimals);
    return parseFloat(str);
  }
  
  // --- Параметры генерации ---
  const SPECIFIC_IDS = [1032497, 1032504, 1059263, 1055742, 1045392, 1071978];
  const TOTAL_STEPS_TARGET = 180;
  const ADDITIONAL_STEPS_NEEDED = TOTAL_STEPS_TARGET - SPECIFIC_IDS.length;
  const GENERATED_START_ID = 1055742; // Начальный ID для дополнительных шагов
  
  // --- Генерация ID ---
  const allStepIds = [...SPECIFIC_IDS];
  for (let i = 0; i < ADDITIONAL_STEPS_NEEDED; i++) {
      const potentialId = GENERATED_START_ID + i;
      // Убедимся, что не добавляем дубликат, если вдруг GENERATED_START_ID пересекся со SPECIFIC_IDS
      if (!allStepIds.includes(potentialId)) {
          allStepIds.push(potentialId);
      } else {
        // Если ID уже есть, просто пропустим итерацию или сгенерируем другой
        // Для простоты здесь пропустим, но это может привести к меньшему кол-ву шагов, чем TOTAL_STEPS_TARGET
        // Можно добавить логику генерации другого ID, если нужно строго 180 уникальных
        console.warn(`Сгенерированный ID ${potentialId} уже есть в specific_ids, пропущен.`);
      }
  }
  // Перемешаем массив ID для большей случайности в таблице/графике (необязательно)
  allStepIds.sort(() => Math.random() - 0.5);
  
  
  // --- Генерация данных для всех ID ---
  const generatedStepData = {};
  let currentCompletions = 15000; // Имитируем спад
  
  allStepIds.forEach(stepId => {
      // Имитация спада прохождений
      currentCompletions = Math.max(3000 + getRandomInt(0,2000) , currentCompletions - getRandomInt(5, 80)); // Уменьшаем, но оставляем > 3000-5000
  
      generatedStepData[stepId] = {
          completions: currentCompletions,
          dropouts: getRandomInt(Math.floor(currentCompletions * 0.01), Math.floor(currentCompletions * 0.15)), // Отсев как % от прохождений
          avg_time: getRandomInt(20, 700), // сек
          success_rate: getRandomFloat(0.45, 0.99, 2), // 45% - 99%
          avg_attempts: getRandomFloat(1.1, 6.5, 1),
          comments: getRandomInt(0, 70),
          question_freq: getRandomFloat(0.0, 0.45, 2), // 0% - 45%
          self_correction_rate: getRandomFloat(0.0, 0.35, 2) // 0% - 35%
      };
  });
  
  // --- Формирование объекта mockMetrics ---
  export const mockMetrics = {
      completions_per_step: {},
      dropouts_per_step: {},
      avg_time_per_step: {},
      success_rate: {},
      avg_attempts: {},
      comments_per_step: {},
      question_freq: {},
      self_correction_rate: {},
  
      // Глобальные метрики оставляем статичными (completion rate все равно придет из API)
      avg_completion_percent: 0.78,
      avg_time_between_steps: 215,
      full_course_completion: 0.55, // Будет перезаписано API
  };
  
  // Заполняем mockMetrics из сгенерированных данных
  Object.keys(generatedStepData).forEach(stepId => {
      mockMetrics.completions_per_step[stepId] = generatedStepData[stepId].completions;
      mockMetrics.dropouts_per_step[stepId] = generatedStepData[stepId].dropouts;
      mockMetrics.avg_time_per_step[stepId] = generatedStepData[stepId].avg_time;
      mockMetrics.success_rate[stepId] = generatedStepData[stepId].success_rate;
      mockMetrics.avg_attempts[stepId] = generatedStepData[stepId].avg_attempts;
      mockMetrics.comments_per_step[stepId] = generatedStepData[stepId].comments;
      mockMetrics.question_freq[stepId] = generatedStepData[stepId].question_freq;
      mockMetrics.self_correction_rate[stepId] = generatedStepData[stepId].self_correction_rate;
  });
  
  
  // --- Функция генерации данных для таблицы/графика ---
  // Она теперь будет использовать сгенерированные mockMetrics
  export const generateMockStepData = () => {
      if (!mockMetrics || !mockMetrics.completions_per_step) {
          console.error("mockMetrics или completions_per_step не найдены в mockData.js");
          return [];
      }
      // Используем массив ID, чтобы сохранить порядок (если нужно) или просто ключи объекта
      // const stepIds = allStepIds; // Если нужен порядок из массива allStepIds
      const stepIds = Object.keys(mockMetrics.completions_per_step); // Если порядок не важен
  
      return stepIds.map((stepId) => {
        const id = parseInt(stepId, 10);
        const successRate = mockMetrics.success_rate?.[id];
        const questionFreq = mockMetrics.question_freq?.[id];
        const selfCorrectionRate = mockMetrics.self_correction_rate?.[id];
  
        return {
          id: id, // Используем реальный step_id как id для DataGrid
          step_id: id,
          name: `Шаг ${id}`, // Имя шага (можно будет заменить на реальное из API)
          completions: mockMetrics.completions_per_step[id] || 0,
          dropouts: mockMetrics.dropouts_per_step?.[id] || 0,
          avg_time: mockMetrics.avg_time_per_step?.[id] || 0,
          success_rate:
            successRate !== undefined ? `${(successRate * 100).toFixed(1)}%` : 'N/A',
          avg_attempts: mockMetrics.avg_attempts?.[id]?.toFixed(1) || 'N/A',
          comments: mockMetrics.comments_per_step?.[id] || 0,
          question_freq:
            questionFreq !== undefined ? `${(questionFreq * 100).toFixed(1)}%` : 'N/A',
          self_correction_rate:
            selfCorrectionRate !== undefined ? `${(selfCorrectionRate * 100).toFixed(1)}%` : 'N/A',
        };
      });
    };
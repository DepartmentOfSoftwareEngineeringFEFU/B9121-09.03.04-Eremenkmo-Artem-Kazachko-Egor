// src/components/dashboardUtils.js

// --- Функции форматирования ---

export const formatPercentage = (value) => {
  // Эта функция ожидает значение от 0.0 до 1.0 для корректного отображения процентов
  if (value === null || typeof value !== 'number' || !isFinite(value)) return "N/A";

  // Если значение уже > 1 (например, передали 80 вместо 0.8), но <= 100, считаем, что это уже %
  if (value > 1 && value <= 100.5) { // 100.5 для округления
      return `${value.toFixed(1)}%`;
  }
  // Стандартный случай: значение от 0.0 до 1.0
  if (value >= 0 && value <= 1) {
      return `${(value * 100).toFixed(1)}%`;
  }
  // Если значение вне ожидаемых диапазонов для процентов, но все же число
  console.warn(`formatPercentage: значение ${value} вне стандартного диапазона 0-1 или 1-100%`);
  return `${value.toFixed(1)}%`; // Показываем как есть с %
};

export const formatNumber = (value, decimals = 1) => {
  if (value === null || typeof value === 'undefined' || !isFinite(value)) return "N/A";
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return "N/A";
  return numValue.toFixed(decimals);
};

export const formatIntegerWithZero = (value) => {
  if (value === null || typeof value === 'undefined') return "N/A";
  if (value === 0) return "0"; // Явно обрабатываем 0
  const intValue = parseInt(value, 10);
  return isNaN(intValue) || !isFinite(intValue) ? "N/A" : intValue.toString();
};

export const formatTime = (valueInSeconds) => {
    if (valueInSeconds === null || typeof valueInSeconds !== 'number' || !isFinite(valueInSeconds) || valueInSeconds < 0) return "N/A";
    if (valueInSeconds === 0) return "0 сек";
    const minutes = Math.floor(valueInSeconds / 60);
    const seconds = Math.round(valueInSeconds % 60);
    if (minutes === 0 && seconds === 0 && valueInSeconds > 0 && valueInSeconds < 1) {
      return `<1 сек`;
    }
    if (minutes === 0) {
      return `${seconds} сек`;
    }
    return `${minutes} мин ${seconds} сек`;
  };


// --- Определение доступных метрик ---
// ВАЖНО:
// - `thresholdGood` и `thresholdBad` должны быть в "сыром" виде (т.е. 0.0-1.0 для процентов).
//   Компонент DashboardChart сам их преобразует для оси Y (умножит на 100, если isRate=true).
// - `yAxisDomainFixed` задается в том масштабе, в котором значения будут на оси Y графика
//   (т.е. 0-100 для процентов, если isRate=true и значения в chartData преобразуются в 0-100).

// --- Определение доступных метрик с ОПИСАНИЯМИ ---
export const availableMetrics = [
     {
    value: "success_rate", // В твоем файле это метрика №2 "Успешность"
    label: "Успешность шага (%)",
    dataKey: "success_rate",
    format: formatPercentage,
    isRate: true,
    yAxisDomainFixed: [75, 100],
    yAxisTicksFixed: [70, 75, 80, 85, 90, 95, 100],
    thresholdGood: 0.85, // >0.8 - хорошее задание
    thresholdBad: 0.80,  // <0.5 - плохое задание
    description: "Доля уникальных студентов, успешно выполнивших задание (R), от общего числа уникальных студентов, приступивших к его выполнению (T). (P=R/T, где R - уники верно, T - уники пытались).",
    getTextCellClassName: (rawValue, metricDefinition) => {
        if (rawValue == null || !isFinite(rawValue)) return '';
        if (metricDefinition.invertThresholds) {
            if (rawValue <= metricDefinition.thresholdGood) return 'metric-text--good';
            if (rawValue > metricDefinition.thresholdBad) return 'metric-text--bad';
        } else {
            if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good';
            if (rawValue < metricDefinition.thresholdBad) return 'metric-text--bad';
        }
        return 'metric-text--normal';
    }    
},
   

  {
    value: "difficulty_index", // В твоем файле это метрика №1 "Сложность шага"
    label: "Сложность шага (индекс)",
    dataKey: "difficulty_index",
    format: (v) => formatNumber(v, 3),
    isRate: false, 
    yAxisDomainFixed: [0, 1],
    thresholdGood: 0.70, // Выше = легче (согласно P=R/T, где R - правильные)
    thresholdBad: 0.30,  // Ниже = сложнее
    description: "Отношение количества правильных сабмитов (R) к общему количеству сабмитов (T) на шаге (P=R/T). Высокое значение (ближе к 1) означает, что большинство попыток были успешными, что может указывать на более легкое задание.",
getTextCellClassName: (rawValue, metricDefinition) => {
      if (rawValue == null || !isFinite(rawValue)) return '';
      if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good'; // Легкий
      if (rawValue < metricDefinition.thresholdBad) return 'metric-text--bad';   // Трудный
      return 'metric-text--normal'; // Средний
    },  
},
  {
    value: "discrimination_index",
    label: "Дискриминативность (индекс)",
    dataKey: "discrimination_index",
    format: (v) => formatNumber(v, 3),
    isRate: false,
    yAxisDomainFixed: [-0.25, 1.05], // Добавил чуть больше запаса снизу
    yAxisTicksFixed: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0],
    thresholdGood: 0.35,
    thresholdBad: 0.15,
    description: "Измеряет, насколько хорошо задание различает студентов с высоким и низким уровнем знаний (на основе общих баллов в уроке). Рассчитывается как (UG-LG)/n, где UG - доля правильных ответов у 27% лучших студентов, LG - у 27% худших, n - размер одной группы.",
getTextCellClassName: (rawValue, metricDefinition) => {
        if (rawValue == null || !isFinite(rawValue)) return '';
        if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good';
        if (rawValue < metricDefinition.thresholdBad) return 'metric-text--bad';
        return 'metric-text--normal';
    }  
},
   {
    value: "skip_rate", // Похоже на метрику №3 "Неуспешность", но в коде у тебя это "Доля пропуска"
    label: "Доля продолживших успешно (%)", // Новое название для ясности
    dataKey: "skip_rate", // (Число не сдавших И сдавших что-то дальше) / (Всего не сдавших)
    format: formatPercentage,
    isRate: true,
    yAxisDomainFixed: [0, 100.5],
    // Пороги для этой метрики нужно определить. Высокое значение здесь - хорошо.
    // thresholdGood: 0.70, 
    // thresholdBad: 0.30,
    description: "Доля студентов, которые НЕ сдали текущий шаг, но затем успешно выполнили хотя бы один из ПОСЛЕДУЮЩИХ шагов. Рассчитывается как: (кол-во не сдавших этот шаг, но сдавших что-то дальше) / (общее кол-во не сдавших этот шаг).",
getTextCellClassName: (rawValue, metricDefinition) => {
        if (rawValue == null || !isFinite(rawValue)) return '';
        if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good';
        if (rawValue < metricDefinition.thresholdBad) return 'metric-text--bad';
        return 'metric-text--normal';
    }  
},
  {
    value: "completion_index", // В твоем файле это метрика №4 "Индекс завершения" (Отвал)
    label: 'Индекс "отвала" после шага (%)',
    dataKey: "completion_index",
    format: formatPercentage,
    isRate: true,
    yAxisDomainFixed: [0, 25.5],
    yAxisTicksFixed: [0, 5, 10, 15, 20, 25],
    thresholdGood: 0.05,
    thresholdBad: 0.15,
    invertThresholds: true,
    description: "Доля студентов, которые пытались выполнить этот шаг (T), но после него не предприняли попыток на следующих шагах курса (R). (P=R/T). Высокое значение может указывать на точку 'отвала' студентов.",
getTextCellClassName: (rawValue, metricDefinition) => {
        if (rawValue == null || !isFinite(rawValue)) return '';
        if (metricDefinition.invertThresholds) {
            if (rawValue <= metricDefinition.thresholdGood) return 'metric-text--good';
            if (rawValue > metricDefinition.thresholdBad) return 'metric-text--bad';
        } else {
            if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good';
            if (rawValue < metricDefinition.thresholdBad) return 'metric-text--bad';
        }
        return 'metric-text--normal';
    }  
},
  {
    value: "avg_completion_time_filtered_seconds", // Метрика №5
    label: "Ср. время выполнения (сек, фильтр.)",
    dataKey: "avg_completion_time_filtered_seconds",
    format: formatTime,
    yAxisDomainFixed: [0, 'auto'],
    description: "Среднее время между первой попыткой и последней ВЕРНОЙ попыткой для студентов, успешно сдавших шаг. Из расчета исключаются сессии длиннее 3 часов.",
  },
  {
    value: "avg_attempts_per_passed", // Метрика №6
    label: "Ср. число попыток (для успеха)",
    dataKey: "avg_attempts_per_passed",
    format: (v) => formatNumber(v, 1),
    yAxisDomainFixed: [0, 5],
    yAxisTicksFixed: [0, 1, 2, 3, 4, 5],
    thresholdGood: 1.5,
    thresholdBad: 3.5,
    invertThresholds: true,
    description: "Среднее количество всех сабмитов (попыток), сделанных на шаге, на одного уникального студента, успешно сдавшего этот шаг. Рассчитывается как (общее кол-во сабмитов на шаге) / (кол-во уников, успешно сдавших шаг).",
    getTextCellClassName: (rawValue, metricDefinition) => {
      if (rawValue == null || !isFinite(rawValue)) return '';
      if (metricDefinition.invertThresholds) {
        if (rawValue <= metricDefinition.thresholdGood) return 'metric-text--good';
        if (rawValue > metricDefinition.thresholdBad) return 'metric-text--bad';
      } else {
        if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good';
        if (rawValue < metricDefinition.thresholdBad) return 'metric-text--bad';
      }
      return 'metric-text--normal';
    }, 
},
  {
    value: "comment_rate", // Метрика №7 "Комментарии" - относительная
    label: "Доля комментирующих (%)",
    dataKey: "comment_rate",
    format: formatPercentage,
    isRate: true,
    yAxisDomainFixed: [0, 20.5],
    yAxisTicksFixed: [0, 5, 10, 15, 20],
    thresholdGood: 0.10,
    thresholdBad: 0.02,
    description: "Отношение числа уникальных студентов, оставивших комментарии к этому шагу, к общему числу уникальных студентов, просмотревших этот шаг.",
getTextCellClassName: (rawValue, metricDefinition) => {
      if (rawValue == null || !isFinite(rawValue)) return '';
      if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good';
      if (rawValue < metricDefinition.thresholdBad) return 'metric-text--bad';
      return 'metric-text--normal';
    },  
},
  {
    value: "comment_count", // Дополнительно, абсолютное число комментариев
    label: "Комментарии (всего, шт.)",
    dataKey: "comment_count",
    format: formatIntegerWithZero,
    yAxisDomainFixed: [0, 'auto'],
    description: "Общее количество комментариев, оставленных к этому шагу.",
  },
  {
    value: "usefulness_index", // Метрика №8 "Полезность"
    label: "Индекс вовлеченности в просмотры", // Новое название
    dataKey: "usefulness_index",
    format: (v) => formatNumber(v, 1),
    yAxisDomainFixed: [0, 'auto'], // Может быть большим
    thresholdGood: 3.0, // >3 - очень полезный
    thresholdBad: 1.0,  // 1 - не полезный
    description: "Отношение общего количества просмотров шага к количеству уникальных студентов, просмотревших этот шаг (Все просмотры / Уник. просмотры). Высокое значение (например, >3) может указывать на то, что студенты часто возвращаются к материалу шага.",
getTextCellClassName: (rawValue, metricDefinition) => {
      if (rawValue == null || !isFinite(rawValue)) return '';
      if (rawValue >= metricDefinition.thresholdGood) return 'metric-text--good';
      if (rawValue <= metricDefinition.thresholdBad) return 'metric-text--bad'; // <= 1 - плохо
      return 'metric-text--normal'; // 1.1 - 2.9 - нормально
    },  
},
  {
    value: "passed_users_sub",
    label: "Прошли шаг (уник. чел.)",
    dataKey: "passed_users_sub",
    format: formatIntegerWithZero,
    yAxisDomainFixed: [0, 'auto'],
    description: "Количество уникальных студентов, которые успешно сдали (получили статус 'correct') этот шаг.",
  },
  {
    value: "all_users_attempted",
    label: "Пытались сдать (уник. чел.)",
    dataKey: "all_users_attempted",
    format: formatIntegerWithZero,
    yAxisDomainFixed: [0, 'auto'],
    description: "Количество уникальных студентов, которые сделали хотя бы одну попытку (сабмит) на этом шаге.",
  },
  {
    value: "views",
    label: "Просмотры (всего)",
    dataKey: "views",
    format: formatIntegerWithZero,
    yAxisDomainFixed: [0, 'auto'],
    description: "Общее количество просмотров этого шага всеми студентами (неуникальные просмотры).",
  },
  {
    value: "unique_views",
    label: "Уникальные просмотры (уник. чел.)",
    dataKey: "unique_views",
    format: formatIntegerWithZero,
    yAxisDomainFixed: [0, 'auto'],
    description: "Количество уникальных студентов, которые просмотрели этот шаг хотя бы один раз.",
  },
];
export const getStepOverallStatus = (stepData, metricsDefinitions) => {
  let badCount = 0;
  let normalCount = 0;
  let goodCount = 0;
  let evaluatedMetricsCount = 0;

  // console.log(`--- Dominance Check Step ID: ${stepData.step_id} ---`);

  for (const metric of metricsDefinitions) {
    if (metric.getTextCellClassName && stepData.hasOwnProperty(metric.dataKey)) {
      const rawValue = stepData[metric.dataKey];
      const className = metric.getTextCellClassName(rawValue, metric);
      
      if (className) { // Учитываем только метрики, для которых вернулся какой-то класс
        evaluatedMetricsCount++;
        // console.log(`  Metric: ${metric.value}, Raw: ${rawValue}, Class: ${className}`);
        if (className === 'metric-text--bad') {
          badCount++;
        } else if (className === 'metric-text--normal') {
          normalCount++;
        } else if (className === 'metric-text--good') {
          goodCount++;
        }
      }
    }
  }

  // console.log(`  Counts for Step ID ${stepData.step_id}: Bad=${badCount}, Normal=${normalCount}, Good=${goodCount}, Evaluated=${evaluatedMetricsCount}`);

  if (evaluatedMetricsCount === 0) {
    // console.log(`  Result for Step ID ${stepData.step_id} (Dominance): default (no evaluated metrics)`);
    return 'default'; // Нет метрик с оценками
  }

  // Правило 1: Одна красная, остальные не красные -> оранжевый
  if (badCount === 1 && (goodCount > 0 || normalCount > 0)) {
    // console.log(`  Result for Step ID ${stepData.step_id} (Dominance): normal (single bad, others ok)`);
    return 'normal';
  }

  // Правило 2: Больше одной красной ИЛИ красных больше всего -> красный
  if (badCount > 1 || (badCount > 0 && badCount > goodCount && badCount > normalCount)) {
    // console.log(`  Result for Step ID ${stepData.step_id} (Dominance): bad (multiple bad or dominance)`);
    return 'bad';
  }
  // Сюда попадаем, если badCount === 0 или (badCount === 1 и goodCount === 0 и normalCount === 0 - этот случай покроется ниже)

  // Правило 3: Зеленых больше ИЛИ столько же, сколько оранжевых (и нет красных по правилу 2) -> зеленый
  if (goodCount >= normalCount) { // Если goodCount > 0
    // console.log(`  Result for Step ID ${stepData.step_id} (Dominance): good (good dominance or equal to normal, no critical bad)`);
    return 'good';
  }

  // Правило 4: Оранжевых больше (и нет красных по правилу 2) -> оранжевый
  if (normalCount > goodCount) { // Если normalCount > 0
    // console.log(`  Result for Step ID ${stepData.step_id} (Dominance): normal (normal dominance, no critical bad)`);
    return 'normal';
  }
  
  // Правило 5 (Дефолт): если, например, только одна метрика и она bad, но goodCount и normalCount = 0 (не сработало правило 1)
  // Или если goodCount=0, normalCount=0, badCount=0 (уже обработано), или badCount=1 и остальные 0
  if (badCount === 1 && goodCount === 0 && normalCount === 0) {
    // console.log(`  Result for Step ID ${stepData.step_id} (Dominance): bad (single bad, no others)`);
    return 'bad'; // Одна-единственная плохая метрика все же красит в красный
  }


  // console.log(`  Result for Step ID ${stepData.step_id} (Dominance): default (fallback)`);
  return 'default'; // Фоллбэк, если никакое правило не подошло
};
export const getStepInsights = (metrics) => {
  if (!metrics) return { strengths: [], areasForImprovement: [] };

  const insights = {
    strengths: [],
    areasForImprovement: [],
  };

  // Убедимся, что мы используем правильные ключи из объекта metrics (шага)
  const {
    success_rate, // из P=R/T, Успешность
    difficulty_index, // из P=R/T, Сложность
    discrimination_index,
    // comment_count, // Для краткости на странице сравнения можно опустить, или оставить
    // unique_views, // Для краткости на странице сравнения можно опустить
    completion_index, // "Отвал"
    skip_rate, // "Пропуск" (в твоем коде это "Доля продолживших успешно")
    avg_attempts_per_passed,
    usefulness_index, // "Индекс вовлеченности в просмотры"
    // passed_users_sub, // Абсолютные значения можно опустить для краткости инсайтов
  } = metrics;

  // --- Логика для инсайтов (можно скопировать из StepAnalysis.js) ---
  // Примерно так, но можно упростить для страницы сравнения

  // Success Rate (Успешность шага - P=R/T, где R - уники верно, T - уники пытались)
  // Пороги из availableMetrics: good: 0.80, bad: 0.50
  if (typeof success_rate === 'number') {
    if (success_rate >= 0.80) insights.strengths.push({ metric: "Успешность", value: formatPercentage(success_rate), note: "Высокая" });
    else if (success_rate < 0.50) insights.areasForImprovement.push({ metric: "Успешность", value: formatPercentage(success_rate), note: "Низкая, требует внимания" });
  }

  // Difficulty Index (Сложность шага - P=R/T, где R - прав. сабмиты, T - все сабмиты)
  // Пороги из availableMetrics: good: 0.70 (легче), bad: 0.30 (сложнее)
  if (typeof difficulty_index === 'number') {
    if (difficulty_index >= 0.70) insights.strengths.push({ metric: "Сложность", value: formatNumber(difficulty_index,2), note: "Относительно легкий" });
    else if (difficulty_index < 0.30) insights.areasForImprovement.push({ metric: "Сложность", value: formatNumber(difficulty_index,2), note: "Высокая, может быть сложен" });
  }

  // Discrimination Index
  // Пороги из availableMetrics: good: 0.35, bad: 0.15
  if (typeof discrimination_index === 'number') {
    if (discrimination_index >= 0.35) insights.strengths.push({ metric: "Дискриминативность", value: formatNumber(discrimination_index,2), note: "Хорошо разделяет" });
    else if (discrimination_index < 0.15 && discrimination_index !== null) insights.areasForImprovement.push({ metric: "Дискриминативность", value: formatNumber(discrimination_index,2), note: "Плохо разделяет" });
  }

  // Avg Attempts (Среднее число попыток для успеха)
  // Пороги из availableMetrics: good: 1.5 (меньше=лучше), bad: 3.5 (больше=хуже), invertThresholds: true
  if (typeof avg_attempts_per_passed === 'number') {
    if (avg_attempts_per_passed <= 1.5) insights.strengths.push({ metric: "Ср. попыток", value: formatNumber(avg_attempts_per_passed, 1), note: "Мало, быстро решают" });
    else if (avg_attempts_per_passed > 3.5) insights.areasForImprovement.push({ metric: "Ср. попыток", value: formatNumber(avg_attempts_per_passed, 1), note: "Много, возможно неясно" });
  }

  // Completion Index ("Отвал" после шага)
  // Пороги из availableMetrics: good: 0.05 (меньше=лучше), bad: 0.15 (больше=хуже), invertThresholds: true
  if (typeof completion_index === 'number') {
    if (completion_index <= 0.05 && completion_index !== null) insights.strengths.push({ metric: "Удержание (анти-отвал)", value: formatPercentage(completion_index), note: "Низкий отвал после шага" });
    else if (completion_index > 0.15) insights.areasForImprovement.push({ metric: "Отвал после шага", value: formatPercentage(completion_index), note: "Высокий, критично" });
  }
  
  // Skip Rate ("Доля продолживших успешно" / или "Пропуск")
  // В твоем коде skip_rate это: (Число не сдавших И сдавших что-то дальше) / (Всего не сдавших)
  // Здесь чем ВЫШЕ значение, тем ЛУЧШЕ (больше "проскочивших" не сдавших смогли пойти дальше)
  // Пороги из availableMetrics: good: 0.70, bad: 0.30 (invertThresholds: false для этой интерпретации)
  if (typeof skip_rate === 'number') {
    if (skip_rate >= 0.70) insights.strengths.push({ metric: "Преодоление после неудачи", value: formatPercentage(skip_rate), note: "Многие идут дальше даже не сдав" });
    else if (skip_rate < 0.30) insights.areasForImprovement.push({ metric: "Преодоление после неудачи", value: formatPercentage(skip_rate), note: "Мало кто идет дальше не сдав" });
  }

  // Usefulness Index (Индекс вовлеченности в просмотры)
  // Пороги из availableMetrics: good: 3.0, bad: 1.0
   if (typeof usefulness_index === 'number') {
    if (usefulness_index >= 3.0) insights.strengths.push({ metric: "Вовлеченность (просмотры)", value: formatNumber(usefulness_index, 1), note: "Часто пересматривают" });
    else if (usefulness_index <= 1.0 && usefulness_index !== null) insights.areasForImprovement.push({ metric: "Вовлеченность (просмотры)", value: formatNumber(usefulness_index, 1), note: "Мало пересматривают" });
  }


  // Если нет явных сильных или слабых сторон по выбранным метрикам
  if (insights.strengths.length === 0 && insights.areasForImprovement.length === 0) {
    insights.areasForImprovement.push({ note: "Ключевые метрики в средних значениях или требуют детального контекста." });
  }
  return insights;
};
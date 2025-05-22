// src/components/Dashboard/DashboardFilters.js
import React from 'react';
import {
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  Box,
  Chip,
  MenuItem,
  Checkbox,
  ListItemText
} from '@mui/material';

function DashboardFilters({
  modules,              // Массив объектов модулей ( { id, title, position } )
  selectedModuleIds,    // Массив ID выбранных модулей
  setSelectedModuleIds, // Функция для обновления выбранных модулей
  isLoading // Опционально: флаг загрузки, чтобы дизейблить фильтр во время загрузки данных курса
}) {
  const handleModuleChange = (event) => {
    const value = event.target.value; // value может быть массивом ID
    const SELECT_ALL_VALUE = "___SELECT_ALL___"; // Специальное значение для "Выбрать все"

    if (value.includes(SELECT_ALL_VALUE)) {
      // Если "Выбрать все" было кликнуто
      const allValidModuleIds = modules.map(m => m.id).filter(id => id != null);
      const currentValidSelectedIds = selectedModuleIds.filter(id => id != null);

      if (modules.length > 0 && currentValidSelectedIds.length === allValidModuleIds.length) {
        // Если уже все выбраны, снимаем выделение
        setSelectedModuleIds([]);
      } else {
        // Иначе выбираем все
        setSelectedModuleIds(allValidModuleIds);
      }
    } else {
      // Обычный выбор/снятие выбора модулей
      setSelectedModuleIds(
        // Убедимся, что это всегда массив, даже если выбран один элемент
        typeof value === 'string' ? value.split(',') : value.filter(id => id != null)
      );
    }
  };

  const allValidModuleIdsInCourse = modules.map(m => m.id).filter(id => id != null);
  const allCurrentlySelectedValidIds = selectedModuleIds.filter(id => id != null);

  const areAllModulesSelected = modules.length > 0 && allCurrentlySelectedValidIds.length === allValidModuleIdsInCourse.length;
  const areSomeModulesSelected = allCurrentlySelectedValidIds.length > 0 && !areAllModulesSelected;

  return (
    <Paper
      sx={{
        p: 2,
        mb: 3,
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <Typography variant="body1" sx={{ mr: 1, fontWeight: 'bold' }}>
        Фильтры:
      </Typography>
      <FormControl
        sx={{ m: 1, minWidth: 280, maxWidth: 450 }} // Немного увеличил размеры для лучшего отображения
        size="small"
        disabled={isLoading || modules.length === 0} // Дизейблим, если идет загрузка или нет модулей
      >
        <InputLabel id="module-select-label-dbf">Модули</InputLabel>
        <Select
          labelId="module-select-label-dbf"
          id="module-select-dbf"
          multiple
          value={selectedModuleIds}
          onChange={handleModuleChange}
          input={<OutlinedInput label="Модули" />}
          renderValue={(selected) => { // selected - это selectedModuleIds
            if (areAllModulesSelected) {
              return <em>Все модули ({modules.length})</em>;
            }
            if (selected.length === 0) {
              return <em>Все модули ({modules.length || 0})</em>; // Показываем общее кол-во, если ничего не выбрано
            }
            return (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((id) => {
                  const module = modules.find((m) => m.id === id);
                  return (
                    <Chip
                      key={id}
                      label={module?.title || `ID: ${id}`}
                      size="small"
                    />
                  );
                })}
              </Box>
            );
          }}
          MenuProps={{
            PaperProps: { style: { maxHeight: 250, width: 300 } }, // Немного увеличил maxHeight
          }}
        >
          {/* Опция "Выбрать все" / "Снять выделение" */}
          <MenuItem
            value="___SELECT_ALL___"
            disabled={modules.length === 0}
          >
            <Checkbox
              size="small"
              checked={areAllModulesSelected}
              indeterminate={areSomeModulesSelected}
            />
            <ListItemText
              primary={
                <em>
                  {areAllModulesSelected ? "Снять выделение" : "Выбрать все"}
                </em>
              }
            />
          </MenuItem>

          {/* Список модулей */}
          {modules.map((module) =>
            module.id != null ? ( // Пропускаем модули без ID, если такие могут быть
              <MenuItem key={module.id} value={module.id}>
                <Checkbox
                  checked={selectedModuleIds.includes(module.id)}
                  size="small"
                />
                <ListItemText
                  primary={module.title || `Модуль ${module.id}`}
                />
              </MenuItem>
            ) : null
          )}
        </Select>
      </FormControl>
      {/* Здесь можно добавить другие фильтры в будущем, если понадобятся */}
    </Paper>
  );
}

export default DashboardFilters;
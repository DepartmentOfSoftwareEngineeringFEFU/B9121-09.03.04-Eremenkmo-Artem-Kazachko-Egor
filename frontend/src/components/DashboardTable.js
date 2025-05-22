// src/components/DashboardTable.js
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Paper, Box, Button, Checkbox, Typography, CircularProgress } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
// Импортируем утилиту для определения общего статуса шага
import { getStepOverallStatus } from './dashboardUtils'; // Убедись, что путь правильный и функция экспортируется

// Функции форматирования (предполагается, что они в dashboardUtils.js и используются через metric.format)

function DashboardTable({
  dataForGrid,
  availableMetrics, // Это наш массив definitions из dashboardUtils.js
  selectedStepIds,
  onStepSelection,
  onCompareSteps,
  courseIdForLocalStorage,
  modulesForTitle,
  isLoading
}) {

  if (isLoading && (!dataForGrid || dataForGrid.length === 0) ) {
      return (
        <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', my: 5, height: 500}}>
            <Typography sx={{ color: 'text.secondary', mr: 2 }}>Загрузка таблицы...</Typography>
            <CircularProgress size={24}/>
        </Box>
      );
  }

  if (!dataForGrid || dataForGrid.length === 0) {
    return (
      <Typography sx={{ textAlign: 'center', color: 'text.secondary', my: 5, height: 500 }}>
        Нет данных для таблицы.
      </Typography>
    );
  }

  const columns = [
    {
      field: 'selection',
      headerName: 'Выбор',
      width: 70,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Checkbox
          size="small"
          checked={selectedStepIds.includes(params.row.step_id)}
          onChange={() => onStepSelection(params.row.step_id)}
          inputProps={{ 'aria-label': `Выбрать шаг ${params.row.step_id}` }}
        />
      ),
    },
    { field: 'step_id', headerName: 'ID', width: 80, type: 'number' },
    {
      field: 'step_title_full_display',
      headerName: 'Название шага',
      width: 300,
      valueGetter: (_value, row) =>
        row.step_title_full || row.step_title_short || `Шаг ${row.step_id}`,
      renderCell: (params) => {
        const stepName = params.row.step_title_full || params.row.step_title_short || `Шаг ${params.row.step_id}`;
        const overallStatus = getStepOverallStatus(params.row, availableMetrics);

        let statusClassName = '';
        if (overallStatus === 'bad') {
          statusClassName = 'step-name--bad';
        } else if (overallStatus === 'normal') {
          statusClassName = 'step-name--normal';
        } else if (overallStatus === 'good') {
          statusClassName = 'step-name--good';
        }
        // Для DataGrid, чтобы применить класс к содержимому ячейки,
        // нужно обернуть его в элемент и присвоить класс этому элементу,
        // или использовать cellClassName для ячейки и стилизовать внутренний div через CSS.
        // Проще всего вернуть span с классом.
        // <Typography> здесь может быть избыточен, если стили определены в CSS.
        // Если хочешь использовать Typography для других его свойств (variant и т.д.), то можно.
        return <span className={statusClassName}>{stepName}</span>;
      }
    },
    { field: 'step_title_short', headerName: 'Метка', width: 150 },
    {
      field: 'module_title_display',
      headerName: 'Модуль',
      width: 200,
      valueGetter: (_value, row) => {
        const module = modulesForTitle.find((m) => m.id === row.module_id);
        return module?.title || (row.module_id ? `ID: ${row.module_id}` : 'N/A');
      }
    },
    ...availableMetrics.map((metric) => ({
      field: metric.dataKey,
      headerName: metric.label.replace(/\s*\(.*?\)\s*|\s*шага\s*/gi, "").trim(),
      type: 'number',
      width: metric.label.includes('время') || metric.label.includes('Название') || metric.label.includes('комментар') ? 140 : 115,
      valueGetter: (_value, row) => row[metric.dataKey],
      valueFormatter: (value) => metric.format ? metric.format(value) : value,
      headerAlign: 'right',
      align: 'right',
      cellClassName: (cellParams) => {
        if (metric.getTextCellClassName) {
          const rawValue = cellParams.row[metric.dataKey];
          return metric.getTextCellClassName(rawValue, metric);
        }
        return '';
      },
    })),
    {
      field: 'actions',
      headerName: 'Анализ',
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          component={RouterLink}
          disabled={!courseIdForLocalStorage}
          to={
            courseIdForLocalStorage
              ? `/step/${params.row.step_id}?courseId=${encodeURIComponent(courseIdForLocalStorage)}`
              : "#"
          }
        >
          Детали
        </Button>
      ),
    },
  ];

  return (
    <>
      <Paper sx={{ height: 600, width: '100%', mb: 2 }}>
        <DataGrid
          density="compact"
          getRowId={(row) => row.step_id}
          rows={dataForGrid}
          columns={columns}
          initialState={{
            sorting: { sortModel: [{ field: 'step_id', sort: 'asc' }] },
            pagination: { paginationModel: { pageSize: 50 } },
          }}
          pageSizeOptions={[25, 50, 100, 200]}
          disableRowSelectionOnClick
          checkboxSelection={false}
          // Этот блок sx применяется к ячейкам метрик
          sx={{
            // Стили для текста метрик
            '& .MuiDataGrid-cell.metric-text--good .MuiDataGrid-cellContent, & .MuiDataGrid-cell .metric-text--good': { // Целимся в контент ячейки ИЛИ в span внутри
                color: 'green',
                fontWeight: 500,
            },
            '& .MuiDataGrid-cell.metric-text--bad .MuiDataGrid-cellContent, & .MuiDataGrid-cell .metric-text--bad': {
                color: 'red',
                fontWeight: 500,
            },
            '& .MuiDataGrid-cell.metric-text--normal .MuiDataGrid-cellContent, & .MuiDataGrid-cell .metric-text--normal': {
                color: 'orange',
            },
            // Стили для названий шагов (если мы возвращаем span с классом из renderCell)
            // DataGrid оборачивает содержимое renderCell в div с классом MuiDataGrid-cellContent
            '& .MuiDataGrid-cellContent .step-name--bad': {
                color: 'red',
                fontWeight: 500,
            },
            '& .MuiDataGrid-cellContent .step-name--normal': {
                color: 'orange',
                fontWeight: 500, // или normal
            },
            '& .MuiDataGrid-cellContent .step-name--good': {
                color: 'green',
                fontWeight: 500,
            },
          }}
        />
      </Paper>
      <Box sx={{ mt: 2, mb: 3, textAlign: 'center' }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={onCompareSteps}
          disabled={selectedStepIds.length < 2 || isLoading}
        >
          Сравнить выбранные шаги ({selectedStepIds.length})
        </Button>
      </Box>
    </>
  );
}

export default DashboardTable;
// src/components/Dashboard/DashboardChart.js
import React from 'react';
import { Paper, Typography, Box, Tooltip as MuiTooltip, IconButton } from '@mui/material'; 
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'; 
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip, 
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Label,
} from 'recharts';
import MetricSelector from './MetricSelector';

function DashboardChart({
  chartData,
  selectedMetric,
  availableMetrics,
  onMetricChange,
  yAxisDomain,
  yAxisTicks, 
  goodThresholdValue,
  badThresholdValue,
  invertThresholds,
  isRateMetric
}) {

  if (!chartData || chartData.length === 0) {
    return (
      <Paper sx={{ p: 2, mb: 3, textAlign: 'center', color: 'text.secondary' }}>
        <Typography sx={{ my: 3 }}>
          Нет данных для отображения графика. Выберите другие фильтры или метрику.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          mb: 1, 
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}> {}
          <Typography variant="h6">
            Статистика по шагам ({selectedMetric?.label ?? 'Выберите метрику'})
          </Typography>
          {selectedMetric?.description && (
            <MuiTooltip title={<Typography sx={{fontSize: '0.8rem', whiteSpace: 'pre-line'}}>{selectedMetric.description}</Typography>} arrow placement="top">
              <IconButton size="small" sx={{ ml: 0.5, color: 'text.secondary' }}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </MuiTooltip>
          )}
        </Box>
        <MetricSelector
          metrics={availableMetrics}
          selectedMetric={selectedMetric || availableMetrics[0]}
          onChange={onMetricChange}
        />
      </Box>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 15, right: 45, left: 5, bottom: 75 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="step_label"
            angle={-60}
            textAnchor="end"
            interval="preserveStartEnd"
            tick={{ fontSize: 9 }}
            height={80}
          />
          <YAxis
            domain={yAxisDomain}
            allowDataOverflow={false}
            tickCount={6}
            ticks={yAxisTicks && yAxisTicks.length > 0 ? yAxisTicks : undefined}
            tickFormatter={(value) => {
              if (isRateMetric) return `${parseFloat(value).toFixed(0)}%`;
              if (selectedMetric?.dataKey?.includes("index")) return parseFloat(value).toFixed(selectedMetric.dataKey === "discrimination_index" && value < 0 && value > -0.01 ? 3 : 2) ;
              return parseFloat(value).toFixed(0);
            }}
          />
          <RechartsTooltip 
            formatter={(value, name, props) => {
              const originalStepData = props.payload;
              const originalMetricValue = originalStepData && selectedMetric?.dataKey ? originalStepData[selectedMetric.dataKey] : null;
              const formattedValue = selectedMetric?.format ? selectedMetric.format(originalMetricValue) : value;
              return [formattedValue, selectedMetric?.label || name];
            }}
            labelFormatter={(label, payload) =>
              payload?.[0]?.payload?.step_id
                ? `${label} (ID: ${payload[0].payload.step_id})`
                : label
            }
          />
          <Legend verticalAlign="top" height={36} />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="value"
            name={selectedMetric?.label ?? ''}
            stroke="#8884d8"
            activeDot={{ r: 6 }}
            dot={{ r: 3 }}
            connectNulls
          />

          {typeof badThresholdValue === 'number' && isFinite(badThresholdValue) && (
            <ReferenceLine
              y={badThresholdValue}
              stroke="red"
              strokeDasharray="3 3"
              ifOverflow="visible"
            >
              <Label
                value={`Плохо ${invertThresholds ? '>' : '<'} ${
                  selectedMetric?.format && selectedMetric?.thresholdBad != null 
                  ? selectedMetric.format(selectedMetric.thresholdBad) 
                  : badThresholdValue 
                }`}
                position="insideTopLeft"
                fill="red"
                fontSize={15}
              />
            </ReferenceLine>
          )}
          {typeof goodThresholdValue === 'number' && isFinite(goodThresholdValue) && (
            <ReferenceLine
              y={goodThresholdValue}
              stroke="green"
              strokeDasharray="3 3"
              ifOverflow="visible"
            >
              <Label
                value={`Хорошо ${invertThresholds ? '<' : '>'} ${
                  selectedMetric?.format && selectedMetric?.thresholdGood != null 
                  ? selectedMetric.format(selectedMetric.thresholdGood) 
                  : goodThresholdValue
                }`}
                position="insideBottomRight"
                fill="green"
                fontSize={15}
              />
            </ReferenceLine>
          )}
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}

export default DashboardChart;
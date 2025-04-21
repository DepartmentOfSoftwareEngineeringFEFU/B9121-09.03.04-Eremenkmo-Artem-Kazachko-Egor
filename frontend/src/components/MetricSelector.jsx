// frontend/src/components/MetricSelector.jsx
import React from 'react';
import { Select, MenuItem, FormControl, InputLabel } from '@mui/material';

function MetricSelector({ metrics, selectedMetric, onChange }) {
    const handleChange = (event) => {
        const newSelectedMetric = metrics.find(m => m.value === event.target.value);
        onChange(newSelectedMetric);
    };

    return (
        <FormControl sx={{ m: 1, minWidth: 150 }} size="small">
            <InputLabel id="metric-select-label">Метрика</InputLabel>
            <Select
                labelId="metric-select-label"
                id="metric-select"
                value={selectedMetric.value}
                label="Метрика"
                onChange={handleChange}
            >
                {metrics.map((metric) => (
                    <MenuItem key={metric.value} value={metric.value}>
                        {metric.label}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

export default MetricSelector;
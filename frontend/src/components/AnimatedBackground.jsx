// src/components/AnimatedBackground.jsx
import React from "react";
import styled from "@emotion/styled";

const AnimatedSVG = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  opacity: 0.5;
  pointer-events: none;
`;

const RotateLine = styled.line`
  transform-origin: 100px 50px; /* Устанавливаем центр вращения равным centerX и centerY */
  animation: rotate 30s linear infinite;

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

function AnimatedBackground() {
  const centerX = 100;
  const centerY = 50; // Уменьшаем centerY, чтобы поднять окружность
  const radius = 40;
  const numberOfLines = 30;

  const lines = [];
  for (let i = 0; i < numberOfLines; i++) {
    const angle = (i / numberOfLines) * 2 * Math.PI;
    const x1 = centerX + radius * Math.cos(angle);
    const y1 = centerY + radius * Math.sin(angle);
    const x2 = centerX + radius * Math.cos(angle + 0.2);
    const y2 = centerY + radius * Math.sin(angle + 0.2);
    lines.push({ x1, y1, x2, y2 });
  }

  return (
    <AnimatedSVG viewBox="0 0 200 100">
      {" "}
      {/* Изменяем viewBox под centerY */}
      {lines.map((line, index) => (
        <RotateLine
          key={index}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#5c62ec"
          strokeWidth="2"
        />
      ))}
    </AnimatedSVG>
  );
}

export default AnimatedBackground;

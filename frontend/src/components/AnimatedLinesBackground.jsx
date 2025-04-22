import React, { useEffect, useRef } from "react";
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

const AnimatedPath = styled.path`
  stroke-width: 2;
  stroke: #5c62ec;
  fill: none;
  stroke-dasharray: ${(props) => props.length};
  stroke-dashoffset: ${(props) => props.length};
  animation: dash 5s linear forwards;

  @keyframes dash {
    to {
      stroke-dashoffset: 0;
    }
  }
`;

function AnimatedLinesBackground() {
  const pathRef = useRef(null);

  useEffect(() => {
    const pathElement = pathRef.current;
    if (pathElement) {
      const length = pathElement.getTotalLength();
      pathElement.style.strokeDasharray = length;
      pathElement.style.strokeDashoffset = length;
    }
  }, []);

  return (
    <AnimatedSVG viewBox="0 0 400 200">
      <AnimatedPath
        d="M20,100 C20,20 70,20 70,100 S120,180 120,100 S170,20 170,100 S220,180 220,100 S270,20 270,100 S320,180 320,100 S370,20 370,100"
        ref={pathRef}
      />
    </AnimatedSVG>
  );
}

export default AnimatedLinesBackground;

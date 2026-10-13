import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, EdgeProps } from '@xyflow/react';

export default function DataFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isAnimating = data?.isAnimating;
  const payload = data?.payload;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 3, stroke: isAnimating ? '#52c41a' : '#2D2D2D', transition: 'stroke 0.3s ease' }} />
      
      {isAnimating && (
        <>
          <circle r="6" fill="#52c41a" style={{ filter: 'drop-shadow(0 0 4px #52c41a)' }}>
            <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                background: '#1e1e1e',
                color: '#52c41a',
                padding: '6px 10px',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 'bold',
                border: '2px solid #52c41a',
                boxShadow: '4px 4px 0px 0px rgba(82, 196, 26, 0.3)',
                pointerEvents: 'none',
                zIndex: 1000,
                whiteSpace: 'nowrap',
              }}
            >
              {payload}
            </div>
          </EdgeLabelRenderer>
        </>
      )}
    </>
  );
}

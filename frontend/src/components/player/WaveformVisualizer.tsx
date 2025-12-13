"use client";

import { useEffect, useRef } from "react";

interface WaveformVisualizerProps {
  isPlaying: boolean;
  barCount?: number;
  className?: string;
}

export function WaveformVisualizer({
  isPlaying,
  barCount = 40,
  className = "",
}: WaveformVisualizerProps) {
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <div className={`flex items-center justify-center gap-[2px] h-16 ${className}`}>
      {bars.map((i) => (
        <div
          key={i}
          className={`w-1 bg-gradient-to-t from-gray-700 to-gray-500 rounded-full transition-all duration-150 ${
            isPlaying ? "animate-waveform" : "h-2"
          }`}
          style={{
            animationDelay: isPlaying ? `${i * 50}ms` : "0ms",
            height: isPlaying ? undefined : "8px",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes waveform {
          0%,
          100% {
            height: 8px;
          }
          50% {
            height: ${20 + Math.random() * 44}px;
          }
        }
        .animate-waveform {
          animation: waveform 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// Alternative: Progress-based visualizer that shows playback position
interface ProgressWaveformProps {
  progress: number; // 0-100
  isPlaying: boolean;
  className?: string;
}

export function ProgressWaveform({
  progress,
  isPlaying,
  className = "",
}: ProgressWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = 3;
    const gap = 2;
    const barCount = Math.floor(width / (barWidth + gap));

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Generate pseudo-random but consistent heights
    const heights: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const seed = Math.sin(i * 0.5) * 10000;
      heights.push(0.3 + Math.abs(Math.sin(seed) * 0.7));
    }

    const progressIndex = Math.floor((progress / 100) * barCount);

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap);
      const barHeight = heights[i] * height;
      const y = (height - barHeight) / 2;

      if (i <= progressIndex) {
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#4b5563";
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1);
      ctx.fill();
    }
  }, [progress, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={60}
      className={`w-full h-auto ${className}`}
    />
  );
}

// Simple animated bars for when audio is playing
export function AudioBars({
  isPlaying,
  className = "",
}: {
  isPlaying: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-center gap-1 h-8 ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1 bg-white rounded-full transition-all duration-200 ${
            isPlaying ? "animate-bounce" : ""
          }`}
          style={{
            height: isPlaying ? "100%" : "4px",
            animationDelay: `${i * 100}ms`,
            animationDuration: "0.6s",
          }}
        />
      ))}
    </div>
  );
}

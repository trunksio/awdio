"use client";

import type { ManifestSegment } from "@/lib/types";

interface SegmentManagerProps {
  segments: ManifestSegment[];
  currentSegmentIndex: number;
  segmentStartTimes: number[];
  onSegmentClick: (index: number) => void;
  showTranscript?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SegmentManager({
  segments,
  currentSegmentIndex,
  segmentStartTimes,
  onSegmentClick,
  showTranscript = true,
}: SegmentManagerProps) {
  const currentSegment = segments[currentSegmentIndex];

  return (
    <div className="space-y-4">
      {/* Current Speaker Display */}
      {currentSegment && (
        <div className="text-center">
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-gray-800 rounded-full">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="font-medium text-lg">{currentSegment.speaker}</span>
          </div>
        </div>
      )}

      {/* Current Transcript */}
      {showTranscript && currentSegment && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-h-48 overflow-y-auto">
          <p className="text-gray-300 text-lg leading-relaxed">
            {currentSegment.text}
          </p>
        </div>
      )}

      {/* Segment Timeline */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm text-gray-400 mb-3">Segments</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {segments.map((segment, index) => {
            const isActive = index === currentSegmentIndex;
            const isPast = index < currentSegmentIndex;

            return (
              <button
                key={index}
                onClick={() => onSegmentClick(index)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-gray-700 border border-gray-600"
                    : isPast
                    ? "bg-gray-800/50 hover:bg-gray-800"
                    : "bg-gray-800 hover:bg-gray-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    )}
                    <span
                      className={`font-medium ${
                        isActive ? "text-white" : "text-gray-300"
                      }`}
                    >
                      {segment.speaker}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTime(segmentStartTimes[index] || 0)}
                  </span>
                </div>
                <p
                  className={`text-sm truncate ${
                    isActive ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {segment.text}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Compact variant for smaller displays
export function SegmentIndicator({
  segments,
  currentSegmentIndex,
  onSegmentClick,
}: Pick<SegmentManagerProps, "segments" | "currentSegmentIndex" | "onSegmentClick">) {
  return (
    <div className="flex gap-1">
      {segments.map((_, index) => (
        <button
          key={index}
          onClick={() => onSegmentClick(index)}
          className={`h-1 rounded-full transition-all ${
            index === currentSegmentIndex
              ? "w-8 bg-white"
              : index < currentSegmentIndex
              ? "w-4 bg-gray-500"
              : "w-4 bg-gray-700 hover:bg-gray-600"
          }`}
          title={`Segment ${index + 1}`}
        />
      ))}
    </div>
  );
}

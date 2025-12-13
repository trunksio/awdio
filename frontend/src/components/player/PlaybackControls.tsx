"use client";

interface PlaybackControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlaybackControls({
  isPlaying,
  isLoading,
  currentTime,
  duration,
  playbackRate,
  volume,
  onToggle,
  onSeek,
  onPlaybackRateChange,
  onVolumeChange,
  onSkipBack,
  onSkipForward,
}: PlaybackControlsProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <div className="w-full space-y-4">
      {/* Progress Bar */}
      <div className="space-y-1">
        <div
          className="h-2 bg-gray-700 rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-white rounded-full relative transition-all"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex items-center justify-center gap-6">
        {/* Skip Back */}
        {onSkipBack && (
          <button
            onClick={onSkipBack}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Previous segment"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
        )}

        {/* Rewind 10s */}
        <button
          onClick={() => onSeek(Math.max(0, currentTime - 10))}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="Rewind 10 seconds"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text x="9" y="15" fontSize="6" fill="currentColor">10</text>
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={onToggle}
          disabled={isLoading}
          className="p-4 bg-white text-black rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isLoading ? (
            <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : isPlaying ? (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Forward 10s */}
        <button
          onClick={() => onSeek(Math.min(duration, currentTime + 10))}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="Forward 10 seconds"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
            <text x="9" y="15" fontSize="6" fill="currentColor">10</text>
          </svg>
        </button>

        {/* Skip Forward */}
        {onSkipForward && (
          <button
            onClick={onSkipForward}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Next segment"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        )}
      </div>

      {/* Secondary Controls */}
      <div className="flex items-center justify-between">
        {/* Playback Speed */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Speed</span>
          <select
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
            className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-700"
          >
            {playbackRates.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVolumeChange(volume === 0 ? 1 : 0)}
            className="text-gray-400 hover:text-white"
          >
            {volume === 0 ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-20 accent-white"
          />
        </div>
      </div>
    </div>
  );
}

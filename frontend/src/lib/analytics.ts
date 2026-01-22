/**
 * Analytics tracking library for Awdio platform.
 *
 * Tracks user interactions with awdios, podcasts, quizzes, and surveys.
 */

type ResourceType = "awdio" | "podcast" | "quiz" | "survey";
type EventType =
  | "view_start"
  | "view_complete"
  | "segment_view"
  | "qa_start"
  | "qa_complete"
  | "pause"
  | "resume";
type Source = "direct" | "embed" | "api";

interface EventData {
  segment_index?: number;
  total_segments?: number;
  question?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

interface TrackEventParams {
  resourceType: ResourceType;
  resourceId: string;
  sessionId?: string;
  eventType: EventType;
  eventData?: EventData;
  source?: Source;
}

// Generate or retrieve viewer session ID
function getViewerSessionId(): string {
  const storageKey = "awdio_viewer_session_id";
  let sessionId = sessionStorage.getItem(storageKey);

  if (!sessionId) {
    sessionId = `vs_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(storageKey, sessionId);
  }

  return sessionId;
}

// Get the referrer URL
function getReferrer(): string | undefined {
  if (typeof document !== "undefined" && document.referrer) {
    return document.referrer;
  }
  return undefined;
}

// Detect if we're in an embed context
function detectSource(): Source {
  if (typeof window === "undefined") return "direct";

  // Check if we're in an iframe
  try {
    if (window.self !== window.top) {
      return "embed";
    }
  } catch {
    // Cross-origin iframe
    return "embed";
  }

  // Check URL path for embed routes
  if (window.location.pathname.includes("/embed/")) {
    return "embed";
  }

  return "direct";
}

/**
 * Track an analytics event.
 */
async function trackEvent(params: TrackEventParams): Promise<void> {
  const {
    resourceType,
    resourceId,
    sessionId,
    eventType,
    eventData = {},
    source = detectSource(),
  } = params;

  const viewerSessionId = getViewerSessionId();
  const referrer = getReferrer();

  try {
    const response = await fetch("/awdio/api/v1/analytics/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resource_type: resourceType,
        resource_id: resourceId,
        session_id: sessionId,
        event_type: eventType,
        event_data: eventData,
        viewer_session_id: viewerSessionId,
        source,
        referrer,
      }),
    });

    if (!response.ok) {
      console.warn("Analytics tracking failed:", await response.text());
    }
  } catch (error) {
    // Silently fail - analytics should not break the app
    console.warn("Analytics tracking error:", error);
  }
}

/**
 * Analytics tracker for a specific resource.
 *
 * Usage:
 * ```ts
 * const tracker = createTracker("awdio", awdioId, sessionId);
 * tracker.viewStart(totalSegments);
 * tracker.segmentView(0);
 * tracker.qaStart("What is this?");
 * tracker.qaComplete("What is this?");
 * tracker.viewComplete();
 * ```
 */
export function createTracker(
  resourceType: ResourceType,
  resourceId: string,
  sessionId?: string
) {
  const source = detectSource();

  return {
    /**
     * Track view start event.
     */
    viewStart(totalSegments?: number) {
      trackEvent({
        resourceType,
        resourceId,
        sessionId,
        eventType: "view_start",
        eventData: totalSegments ? { total_segments: totalSegments } : {},
        source,
      });
    },

    /**
     * Track view complete event.
     */
    viewComplete(durationMs?: number) {
      trackEvent({
        resourceType,
        resourceId,
        sessionId,
        eventType: "view_complete",
        eventData: durationMs ? { duration_ms: durationMs } : {},
        source,
      });
    },

    /**
     * Track segment view event.
     */
    segmentView(segmentIndex: number) {
      trackEvent({
        resourceType,
        resourceId,
        sessionId,
        eventType: "segment_view",
        eventData: { segment_index: segmentIndex },
        source,
      });
    },

    /**
     * Track Q&A start event.
     */
    qaStart(question?: string) {
      trackEvent({
        resourceType,
        resourceId,
        sessionId,
        eventType: "qa_start",
        eventData: question ? { question } : {},
        source,
      });
    },

    /**
     * Track Q&A complete event.
     */
    qaComplete(question?: string) {
      trackEvent({
        resourceType,
        resourceId,
        sessionId,
        eventType: "qa_complete",
        eventData: question ? { question } : {},
        source,
      });
    },

    /**
     * Track pause event.
     */
    pause(segmentIndex?: number) {
      trackEvent({
        resourceType,
        resourceId,
        sessionId,
        eventType: "pause",
        eventData: segmentIndex !== undefined ? { segment_index: segmentIndex } : {},
        source,
      });
    },

    /**
     * Track resume event.
     */
    resume(segmentIndex?: number) {
      trackEvent({
        resourceType,
        resourceId,
        sessionId,
        eventType: "resume",
        eventData: segmentIndex !== undefined ? { segment_index: segmentIndex } : {},
        source,
      });
    },
  };
}

// Export default analytics object for quick access
export const analytics = {
  createTracker,
  trackEvent,
  getViewerSessionId,
};

export default analytics;

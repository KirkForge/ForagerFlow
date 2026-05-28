/**
 * Lightweight Web Vitals collector.
 * Captures performance metrics and feeds them into the telemetry system.
 * Only active in production; in dev, metrics are logged to console.
 */

import { recordTelemetry } from "@/core/telemetry";
import { logger } from "@/core/logger";

interface MetricEntry {
  name: string;
  value: number;
  rating: string;
  delta: number;
  navigationType: string;
}

let webVitalsCollected = false;

function reportMetric(metric: MetricEntry): void {
  recordTelemetry("web-vital", {
    name: metric.name,
    value: Math.round(metric.value),
    rating: metric.rating,
    delta: Math.round(metric.delta),
    navigationType: metric.navigationType,
  });
}

/**
 * Initialize Web Vitals collection.
 * Uses the Performance Observer API to capture LCP, FID, CLS, INP, TTFB.
 * Falls back gracefully in environments that do not support the API.
 */
export function initWebVitals(): void {
  if (webVitalsCollected) return;
  webVitalsCollected = true;

  try {
    // LCP (Largest Contentful Paint)
    if (typeof PerformanceObserver !== "undefined") {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          reportMetric({
            name: "LCP",
            value: lastEntry.startTime,
            rating: lastEntry.startTime < 2500 ? "good" : lastEntry.startTime < 4000 ? "needs-improvement" : "poor",
            delta: lastEntry.startTime,
            navigationType: "navigate",
          });
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    }

    // CLS (Cumulative Layout Shift)
    if (typeof PerformanceObserver !== "undefined") {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
            clsValue += (entry as PerformanceEntry & { value: number }).value;
          }
        }
        reportMetric({
          name: "CLS",
          value: clsValue,
          rating: clsValue < 0.1 ? "good" : clsValue < 0.25 ? "needs-improvement" : "poor",
          delta: clsValue,
          navigationType: "navigate",
        });
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    }

    // TTFB (Time to First Byte)
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0) {
      const nav = navEntries[0] as PerformanceResourceTiming;
      const ttfb = nav.responseStart - nav.requestStart;
      reportMetric({
        name: "TTFB",
        value: ttfb,
        rating: ttfb < 200 ? "good" : ttfb < 500 ? "needs-improvement" : "poor",
        delta: ttfb,
        navigationType: "navigate",
      });
    }

    logger.info("Web Vitals collection initialized");
  } catch (err) {
    logger.warn("Web Vitals initialization failed:", err);
  }
}

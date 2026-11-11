"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle } from "lucide-react";
import type { ParameterAlertItem } from "@/lib/thresholds";

interface ParameterToastStackProps {
  alerts: ParameterAlertItem[];
  visible?: boolean;
}

interface ActiveToast extends ParameterAlertItem {
  instanceId: number;
  entering: boolean;
}

interface ExitingToast extends ParameterAlertItem {
  instanceId: number;
  top: number;
  left: number;
  width: number;
  exiting: boolean;
}

interface ToastStackState {
  active: ActiveToast[];
  exiting: ExitingToast[];
}

const SLIDE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const ENTER_DURATION_MS = 340;
const REFLOW_UP_DURATION_MS = 320;
const REFLOW_DOWN_DURATION_MS = 300;
const REFLOW_DOWN_DELAY_MS = 60;
const EXIT_DURATION_MS = 240;
const EXIT_CLEANUP_MS = 280;

function reconcileStack(
  prev: ToastStackState,
  incoming: ParameterAlertItem[],
  rectMap: Map<number, DOMRect>,
  allocId: () => number
): ToastStackState {
  const incomingByKey = new Map(incoming.map((item) => [item.key, item]));

  let changed = false;
  const nextActive: ActiveToast[] = [];
  const nextExiting: ExitingToast[] = [...prev.exiting];

  for (const existing of prev.active) {
    const updated = incomingByKey.get(existing.key);
    if (updated) {
      if (
        updated.severity !== existing.severity ||
        updated.title !== existing.title ||
        updated.message !== existing.message
      ) {
        changed = true;
        nextActive.push({
          ...existing,
          severity: updated.severity,
          title: updated.title,
          message: updated.message,
        });
      } else {
        nextActive.push(existing);
      }
    } else {
      changed = true;
      const rect = rectMap.get(existing.instanceId);
      if (rect && !nextExiting.some((e) => e.instanceId === existing.instanceId)) {
        nextExiting.push({
          key: existing.key,
          severity: existing.severity,
          title: existing.title,
          message: existing.message,
          instanceId: existing.instanceId,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          exiting: false,
        });
      }
    }
  }

  const existingKeys = new Set(nextActive.map((item) => item.key));
  for (const item of incoming) {
    if (!existingKeys.has(item.key)) {
      changed = true;
      nextActive.push({
        ...item,
        instanceId: allocId(),
        entering: true,
      });
    }
  }

  if (!changed) return prev;
  return { active: nextActive, exiting: nextExiting };
}

interface ToastCardProps {
  item: ParameterAlertItem;
}

const ToastCard: React.FC<ToastCardProps> = ({ item }) => {
  const isDanger = item.severity === "danger";
  const Icon = isDanger ? AlertOctagon : AlertTriangle;

  return (
    <div
      className={`w-full bg-white rounded-xl border px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 ${
        isDanger
          ? "border-rose-200 shadow-[0_12px_30px_-8px_rgba(15,23,42,0.18),0_2px_8px_rgba(225,29,72,0.10)]"
          : "border-amber-200 shadow-[0_12px_30px_-8px_rgba(15,23,42,0.18),0_2px_8px_rgba(217,119,6,0.10)]"
      }`}
    >
      <div
        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center shrink-0 ${
          isDanger
            ? "bg-rose-50 border-rose-200/80 text-rose-600"
            : "bg-amber-50 border-amber-200/80 text-amber-600"
        }`}
        aria-hidden="true"
      >
        <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-bold leading-tight ${
            isDanger ? "text-rose-700" : "text-amber-700"
          }`}
        >
          {item.title}
        </p>
        <p className="text-[13px] sm:text-sm font-medium text-slate-800 leading-snug mt-0.5">
          {item.message}
        </p>
      </div>
    </div>
  );
};

export const ParameterToastStack: React.FC<ParameterToastStackProps> = ({
  alerts,
  visible = true,
}) => {
  const [stack, setStack] = useState<ToastStackState>({
    active: [],
    exiting: [],
  });

  const nextIdRef = useRef(1);
  const flipRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingFlipRectsRef = useRef<Map<number, DOMRect> | null>(null);
  const exitTimersRef = useRef<Map<number, number>>(new Map());
  const latestAlertsRef = useRef<ParameterAlertItem[]>(alerts);
  latestAlertsRef.current = alerts;

  const alertsSignature = visible
    ? alerts.map((a) => `${a.key}:${a.severity}:${a.message}`).join("|")
    : "__hidden__";

  // Capture live positions before updating active/exiting lists
  useLayoutEffect(() => {
    const effectiveAlerts = visible ? latestAlertsRef.current : [];
    const rectMap = new Map<number, DOMRect>();
    flipRefs.current.forEach((el, id) => {
      rectMap.set(id, el.getBoundingClientRect());
    });
    pendingFlipRectsRef.current = rectMap;

    setStack((prev) =>
      reconcileStack(prev, effectiveAlerts, rectMap, () => nextIdRef.current++)
    );
  }, [alertsSignature, visible]);

  // FLIP animation: smoothly slide surviving cards UP or DOWN when siblings enter/exit
  useLayoutEffect(() => {
    const oldRects = pendingFlipRectsRef.current;
    if (!oldRects || oldRects.size === 0) return;
    pendingFlipRectsRef.current = null;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const toAnimate: { el: HTMLDivElement; movingDown: boolean }[] = [];

    for (const item of stack.active) {
      const oldRect = oldRects.get(item.instanceId);
      const el = flipRefs.current.get(item.instanceId);
      if (!oldRect || !el) continue;

      el.style.transition = "none";
      el.style.transform = "translate3d(0, 0, 0)";
      const newRect = el.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;

      if (Math.abs(deltaY) > 0.5) {
        el.style.transform = `translate3d(0, ${deltaY}px, 0)`;
        toAnimate.push({ el, movingDown: deltaY < 0 });
      }
    }

    if (toAnimate.length === 0) return;

    void document.body.offsetHeight;

    for (const { el, movingDown } of toAnimate) {
      const duration = movingDown ? REFLOW_DOWN_DURATION_MS : REFLOW_UP_DURATION_MS;
      const delay = movingDown ? REFLOW_DOWN_DELAY_MS : 0;
      el.style.transition = `transform ${duration}ms ${SLIDE_EASING} ${delay}ms`;
      el.style.transform = "translate3d(0, 0, 0)";
    }
  }, [stack.active]);

  // Trigger smooth slide-right on newly mounted active toasts
  useEffect(() => {
    if (!stack.active.some((item) => item.entering)) return;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setStack((prev) => {
          if (!prev.active.some((item) => item.entering)) return prev;
          return {
            ...prev,
            active: prev.active.map((item) =>
              item.entering ? { ...item, entering: false } : item
            ),
          };
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [stack.active]);

  // Trigger smooth slide-left on detached exiting toasts and remove after completion
  useEffect(() => {
    for (const item of stack.exiting) {
      if (item.exiting && !exitTimersRef.current.has(item.instanceId)) {
        const timerId = window.setTimeout(() => {
          exitTimersRef.current.delete(item.instanceId);
          setStack((prev) => ({
            ...prev,
            exiting: prev.exiting.filter(
              (e) => e.instanceId !== item.instanceId
            ),
          }));
        }, EXIT_CLEANUP_MS);
        exitTimersRef.current.set(item.instanceId, timerId);
      }
    }

    const hasPendingExit = stack.exiting.some((item) => !item.exiting);
    if (!hasPendingExit) return;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setStack((prev) => {
          if (!prev.exiting.some((item) => !item.exiting)) return prev;
          return {
            ...prev,
            exiting: prev.exiting.map((item) =>
              !item.exiting ? { ...item, exiting: true } : item
            ),
          };
        });
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [stack.exiting]);

  // Cleanup exit timers on unmount
  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  if (stack.active.length === 0 && stack.exiting.length === 0) {
    return null;
  }

  return (
    <>
      {/* Active bottom-left notification stack */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Notifikasi parameter mesin"
        className="fixed z-40 pointer-events-none flex flex-col items-start gap-2.5 sm:gap-3 w-[min(calc(100vw-24px),300px)] sm:w-[320px] left-3 bottom-3 sm:left-5 sm:bottom-5"
        style={{
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {stack.active.map((item) => (
          <div
            key={item.instanceId}
            ref={(el) => {
              if (el) {
                flipRefs.current.set(item.instanceId, el);
              } else {
                flipRefs.current.delete(item.instanceId);
              }
            }}
            className="w-full will-change-transform"
          >
            <div
              className="pointer-events-auto w-full will-change-[transform,opacity]"
              style={{
                transform: item.entering
                  ? "translate3d(calc(-100% - 28px), 0, 0)"
                  : "translate3d(0, 0, 0)",
                opacity: item.entering ? 0 : 1,
                transitionProperty: "transform, opacity",
                transitionDuration: `${ENTER_DURATION_MS}ms`,
                transitionTimingFunction: SLIDE_EASING,
              }}
            >
              <ToastCard item={item} />
            </div>
          </div>
        ))}
      </div>

      {/* Detached overlay for cards sliding out to the left without blocking FLIP reflow */}
      {stack.exiting.length > 0 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 pointer-events-none"
        >
          {stack.exiting.map((item) => (
            <div
              key={item.instanceId}
              className="fixed will-change-[transform,opacity]"
              style={{
                top: `${item.top}px`,
                left: `${item.left}px`,
                width: `${item.width}px`,
                transform: item.exiting
                  ? "translate3d(calc(-100% - 28px), 0, 0)"
                  : "translate3d(0, 0, 0)",
                opacity: item.exiting ? 0 : 1,
                transitionProperty: "transform, opacity",
                transitionDuration: `${EXIT_DURATION_MS}ms`,
                transitionTimingFunction: SLIDE_EASING,
              }}
            >
              <ToastCard item={item} />
            </div>
          ))}
        </div>
      )}
    </>
  );
};

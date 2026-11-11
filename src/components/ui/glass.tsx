"use client";

import { type ComponentProps, useSyncExternalStore } from "react";

// Liquid glass for the bar of the sections: a frosted, tinted panel with a sheen and a bright
// rim. Pure backdrop-filter, so it looks the same in every browser.

function subscribeScheme(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  return () => {
    mq.removeEventListener("change", cb);
    obs.disconnect();
  };
}

function readDark(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  if (root.dataset.theme === "dark") return true;
  if (root.dataset.theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function useGlassDark(): boolean {
  return useSyncExternalStore(subscribeScheme, readDark, () => false);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rimShadow(dark: boolean): string {
  return dark
    ? "inset 0 1px 1px rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.12), 0 16px 40px -14px rgba(0,0,0,0.6)"
    : "inset 0 1px 1px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.4), 0 14px 38px -12px rgba(0,0,0,0.28)";
}

function sheen(dark: boolean): string {
  return dark
    ? "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 36%, transparent 64%, rgba(255,255,255,0.06) 100%)"
    : "linear-gradient(135deg, rgba(255,255,255,0.32) 0%, transparent 38%, transparent 62%, rgba(255,255,255,0.14) 100%)";
}

const SATURATION = 1.6;

export interface GlassSurfaceProps extends ComponentProps<"div"> {
  tint?: number;
  blur?: number;
  radius?: number;
}

export function GlassSurface({
  tint = 0.5,
  blur = 14,
  radius = 16,
  className,
  style,
  children,
  ...props
}: GlassSurfaceProps) {
  const dark = useGlassDark();
  const t = clamp01(tint);
  const rgb = dark ? "60,62,68" : "255,255,255";
  const blurPx = Math.max(3, blur * (0.4 + t * 0.6));
  const sat = 1 + (SATURATION - 1) * Math.max(t, 0.25);
  const backdrop = `blur(${blurPx}px) saturate(${sat})`;

  return (
    <div
      className={className ? `relative ${className}` : "relative"}
      style={{ borderRadius: radius, ...style }}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ backdropFilter: backdrop, WebkitBackdropFilter: backdrop }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: `rgba(${rgb},${Math.max(0.04, t * 0.42)})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: sheen(dark) }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ boxShadow: rimShadow(dark) }}
      />
      <div className="relative h-full w-full rounded-[inherit]">{children}</div>
    </div>
  );
}

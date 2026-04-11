import { useEffect, useMemo, useState } from "react";
import { useDemoMode } from "../../lib/demo/DemoModeContext";

const UPLOAD_PHASES = [
  "Reading document...",
  "Extracting data...",
  "Building policy model...",
];

function buildPanelPosition(targetRect) {
  if (typeof window === "undefined" || !targetRect) {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(440px, calc(100vw - 32px))",
    };
  }

  if (window.innerWidth < 960) {
    return {
      left: "16px",
      right: "16px",
      bottom: "16px",
      width: "auto",
    };
  }

  const preferredTop = targetRect.bottom + 18;
  const projectedHeight = 270;
  const top =
    preferredTop + projectedHeight < window.innerHeight - 24
      ? preferredTop
      : Math.max(24, targetRect.top - projectedHeight - 18);
  const left = Math.min(
    Math.max(24, targetRect.left),
    Math.max(24, window.innerWidth - 420 - 24)
  );

  return {
    top,
    left,
    width: "420px",
  };
}

export default function DemoOverlay() {
  const {
    assistantCue,
    currentFocus,
    currentFocusCount,
    currentFocusNumber,
    currentMainStepNumber,
    currentStep,
    currentTargetId,
    finishDemo,
    goBack,
    goNext,
    hasPrevious,
    isDemoMode,
    mainStepCount,
  } = useDemoMode();
  const [targetRect, setTargetRect] = useState(null);
  const [uploadPhaseIndex, setUploadPhaseIndex] = useState(0);

  useEffect(() => {
    if (!isDemoMode || typeof document === "undefined") return undefined;

    const updateRect = () => {
      if (!currentTargetId) {
        setTargetRect(null);
        return;
      }
      const target = document.querySelector(`[data-demo-id="${currentTargetId}"]`);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect(rect);
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    const observer =
      currentTargetId && window.ResizeObserver
        ? new ResizeObserver(() => updateRect())
        : null;
    const target = currentTargetId
      ? document.querySelector(`[data-demo-id="${currentTargetId}"]`)
      : null;
    if (observer && target) {
      observer.observe(target);
    }

    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
      observer?.disconnect();
    };
  }, [currentTargetId, isDemoMode]);

  useEffect(() => {
    if (!isDemoMode || currentStep?.id !== "upload-story") {
      const resetTimer = window.setTimeout(() => setUploadPhaseIndex(0), 0);
      return () => window.clearTimeout(resetTimer);
    }

    let index = 0;
    const resetTimer = window.setTimeout(() => setUploadPhaseIndex(0), 0);
    const interval = window.setInterval(() => {
      index += 1;
      if (index >= UPLOAD_PHASES.length) {
        window.clearInterval(interval);
        return;
      }
      setUploadPhaseIndex(index);
    }, 900);

    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(interval);
    };
  }, [currentStep?.id, isDemoMode]);

  useEffect(() => {
    if (!isDemoMode || typeof document === "undefined") return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        finishDemo();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [finishDemo, isDemoMode]);

  const panelPosition = useMemo(() => buildPanelPosition(targetRect), [targetRect]);

  if (!isDemoMode || !currentStep) return null;

  const highlightStyle = targetRect
    ? {
        position: "fixed",
        top: Math.max(targetRect.top - 10, 10),
        left: Math.max(targetRect.left - 10, 10),
        width: Math.min(targetRect.width + 20, window.innerWidth - 20),
        height: targetRect.height + 20,
        borderRadius: "22px",
        border: "1px solid rgba(125, 211, 252, 0.95)",
        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62), 0 0 0 6px rgba(59, 130, 246, 0.14)",
        background: "transparent",
        zIndex: 110,
        pointerEvents: "auto",
      }
    : {
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.68)",
        zIndex: 110,
      };

  const heading = currentFocus?.title || currentStep.title;
  const description = currentFocus?.description || currentStep.summary;

  return (
    <>
      <div aria-hidden="true" style={highlightStyle} />
      <aside
        style={{
          position: "fixed",
          zIndex: 120,
          display: "grid",
          gap: "16px",
          padding: "20px 22px",
          borderRadius: "24px",
          background: "rgba(255,255,255,0.98)",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          boxShadow: "0 30px 80px rgba(15, 23, 42, 0.28)",
          color: "#0f172a",
          ...panelPosition,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Step {currentMainStepNumber} of {mainStepCount}
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: "1.1" }}>
              {heading}
            </div>
          </div>
          <button
            type="button"
            onClick={() => finishDemo()}
            style={{
              border: "none",
              background: "transparent",
              color: "#64748b",
              fontWeight: 700,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Skip Demo
          </button>
        </div>

        <div style={{ color: "#475569", lineHeight: "1.7" }}>{description}</div>

        {currentFocusCount > 1 ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 10px",
              borderRadius: "999px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              fontSize: "12px",
              fontWeight: 700,
              width: "fit-content",
            }}
          >
            Focus {currentFocusNumber} of {currentFocusCount}
          </div>
        ) : null}

        {currentStep.variant === "upload_story" ? (
          <div
            style={{
              display: "grid",
              gap: "12px",
              padding: "16px 18px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
              border: "1px solid #bfdbfe",
            }}
          >
            <div style={{ display: "grid", gap: "10px" }}>
              {UPLOAD_PHASES.map((phase, index) => (
                <div
                  key={phase}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    color: index <= uploadPhaseIndex ? "#0f172a" : "#94a3b8",
                    fontWeight: index === uploadPhaseIndex ? 700 : 600,
                  }}
                >
                  <span
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "999px",
                      background: index < uploadPhaseIndex ? "#0f172a" : index === uploadPhaseIndex ? "#2563eb" : "#cbd5e1",
                    }}
                  />
                  {phase}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
              <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #dbeafe" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Detected Document</div>
                <div style={{ marginTop: "6px", fontWeight: 700 }}>{currentStep.uploadResult.documentType}</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #dbeafe" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Carrier</div>
                <div style={{ marginTop: "6px", fontWeight: 700 }}>{currentStep.uploadResult.carrier}</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #dbeafe" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Extracted</div>
                <div style={{ marginTop: "6px", fontWeight: 700 }}>{currentStep.uploadResult.extraction}</div>
              </div>
              <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #dbeafe" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Confidence</div>
                <div style={{ marginTop: "6px", fontWeight: 700 }}>{currentStep.uploadResult.confidence}</div>
                <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px", lineHeight: "1.5" }}>
                  {currentStep.uploadResult.missingSupport}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {currentStep.variant === "assistant" ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
              Demo Prompt
            </div>
            <div style={{ fontWeight: 700 }}>{assistantCue?.prompt || currentStep.demoPrompt}</div>
            <div style={{ color: "#475569", lineHeight: "1.6" }}>
              The walkthrough automatically seeds the assistant so viewers can see structured explanation instead of an empty chat box.
            </div>
          </div>
        ) : null}

        {currentStep.variant === "closing" ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {currentStep.bullets.map((item) => (
              <div
                key={item}
                style={{
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ height: "6px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
          <div
            style={{
              width: `${(currentMainStepNumber / mainStepCount) * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={goBack}
            disabled={!hasPrevious}
            style={{
              padding: "11px 14px",
              borderRadius: "12px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: hasPrevious ? "#0f172a" : "#94a3b8",
              cursor: hasPrevious ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentStep.id === "close") {
                finishDemo();
                return;
              }
              goNext();
            }}
            style={{
              padding: "11px 16px",
              borderRadius: "12px",
              border: "none",
              background: "#0f172a",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {currentStep.primaryLabel || "Next"}
          </button>
        </div>
      </aside>
    </>
  );
}

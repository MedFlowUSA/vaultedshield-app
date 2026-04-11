/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buildVaultedPolicyRank } from "../domain/intelligenceEngine";
import { usePlatformShellData } from "../intelligence/PlatformShellDataContext";
import {
  getPolicyDetailRoute,
  isIulShowcasePolicy,
} from "../navigation/insurancePolicyRouting";

const DemoModeContext = createContext(null);

function buildDemoPolicies(rows = []) {
  return [...rows]
    .filter((row) => row?.policy_id)
    .map((row) => ({
      ...row,
      ranking: row.ranking || buildVaultedPolicyRank(row),
    }))
    .sort((left, right) => (right.ranking?.score || 0) - (left.ranking?.score || 0));
}

function buildDemoSteps({
  demoPolicy,
  demoPolicyRoute,
}) {
  const carrierLabel = demoPolicy?.carrier || "Carrier detected";
  const productLabel = demoPolicy?.product || "Indexed universal life policy";

  return [
    {
      id: "welcome",
      route: "/dashboard",
      title: "VaultedShield - Financial Intelligence Platform",
      summary: "Turn complex financial documents into clear, actionable insight.",
      primaryLabel: "Start Walkthrough",
      variant: "welcome",
    },
    {
      id: "upload-story",
      route: "/dashboard",
      title: "From Upload To Structured Analysis",
      summary:
        "The demo starts with one policy packet, recognizes the document, detects the carrier, and turns the file into a structured in-force review path.",
      primaryLabel: "Open Review Console",
      variant: "upload_story",
      uploadResult: {
        documentType: demoPolicy ? "Insurance policy statement" : "Insurance policy packet",
        carrier: carrierLabel,
        extraction: demoPolicy
          ? `${productLabel}, statement values, charges, and chronology extracted`
          : "Core policy fields, statement values, and review signals extracted",
        confidence: demoPolicy ? "High confidence" : "Demo confidence",
        missingSupport: demoPolicy?.latest_statement_date
          ? "Additional illustration pages can improve proof depth."
          : "Current-year statement support is still worth adding.",
      },
    },
    {
      id: "iul-console",
      route: demoPolicyRoute,
      title: "IUL Review Console",
      summary:
        "This is the flagship review flow. It brings the verdict, key drivers, proof, and evidence quality into one executive console.",
      variant: "guided_focus",
      focuses: [
        {
          targetId: "iul-verdict-banner",
          title: "Verdict Banner",
          description: "This is the system's high-level assessment of the policy.",
        },
        {
          targetId: "iul-key-signals",
          title: "Key Signals",
          description: "These show what is driving performance and risk.",
        },
        {
          targetId: "iul-what-matters",
          title: "What Matters Right Now",
          description: "This tells you what actually deserves attention first.",
        },
        {
          targetId: "iul-illustration-proof",
          title: "Illustration Vs Actual",
          description: "This is the proof layer for whether the policy is tracking expectations.",
        },
        {
          targetId: "iul-evidence-ledger",
          title: "Evidence Ledger",
          description: "This shows how strong the underlying support is for each major read.",
        },
      ],
    },
    {
      id: "assistant",
      route: demoPolicyRoute,
      title: "Policy AI Assistant",
      summary:
        "The assistant translates the current analysis into plain-English explanation while staying tied to the actual policy evidence.",
      primaryLabel: "Continue",
      targetId: "policy-ai-assistant",
      demoPrompt: "Is this policy performing well?",
      variant: "assistant",
    },
    {
      id: "cross-asset",
      route: "/dashboard",
      title: "Cross-Asset Household Intelligence",
      summary:
        "VaultedShield connects property, retirement, continuity, documents, and access readiness into one household operating system.",
      primaryLabel: "Open Report Layer",
      targetId: "dashboard-risk-map",
      variant: "guided_focus",
      focuses: [
        {
          targetId: "dashboard-risk-map",
          title: "Connected Household Context",
          description:
            "VaultedShield connects assets, liabilities, protection, document readiness, and portal continuity across the household.",
        },
      ],
    },
    {
      id: "reports",
      route: "/reports",
      title: "Advisor-Ready Reports",
      summary:
        "The report layer turns the same intelligence into a shareable verdict-first readout for partner, advisor, and family review.",
      variant: "guided_focus",
      focuses: [
        {
          targetId: "reports-insurance-card",
          title: "Report Entry Point",
          description: "Choose the report lane that matches the story you want to show, starting with insurance.",
        },
        {
          targetId: "reports-active-view",
          title: "Live Report View",
          description: "This turns policy and household intelligence into a credible, print-ready report surface.",
          reportKey: "insurance",
        },
      ],
    },
    {
      id: "close",
      route: "/reports",
      title: "From Documents to Intelligence",
      summary:
        "VaultedShield helps households understand what they own, how it is performing, where risk is building, and what still needs verification.",
      primaryLabel: "Explore Platform",
      variant: "closing",
      bullets: [
        "Understand what you have",
        "Know how it is performing",
        "Identify risks early",
        "Stay organized across your entire financial life",
      ],
    },
  ];
}

export function DemoModeProvider({ children, pathname, navigate }) {
  const { insuranceRows } = usePlatformShellData();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const lastAutoscrollKeyRef = useRef("");

  const rankedPolicies = useMemo(() => buildDemoPolicies(insuranceRows || []), [insuranceRows]);
  const demoPolicy = useMemo(
    () => rankedPolicies.find((policy) => isIulShowcasePolicy(policy)) || rankedPolicies[0] || null,
    [rankedPolicies]
  );
  const demoPolicyRoute = demoPolicy?.policy_id ? getPolicyDetailRoute(demoPolicy) : "/insurance";
  const steps = useMemo(
    () =>
      buildDemoSteps({
        demoPolicy,
        demoPolicyRoute,
      }),
    [demoPolicy, demoPolicyRoute]
  );

  const currentStep = isDemoMode ? steps[stepIndex] || null : null;
  const currentFocuses = currentStep?.focuses || [];
  const currentFocus = currentFocuses[focusIndex] || null;
  const currentTargetId = currentFocus?.targetId || currentStep?.targetId || null;
  const mainStepCount = steps.length;
  const hasPrevious =
    isDemoMode && (stepIndex > 0 || focusIndex > 0);
  const hasNext =
    isDemoMode &&
    (stepIndex < steps.length - 1 || focusIndex < currentFocuses.length - 1);

  const startDemo = useCallback(() => {
    setIsDemoMode(true);
    setStepIndex(0);
    setFocusIndex(0);
    if (pathname !== "/dashboard") {
      navigate("/dashboard");
    }
  }, [navigate, pathname]);

  const finishDemo = useCallback(
    ({ navigateToDashboard = false } = {}) => {
      setIsDemoMode(false);
      setStepIndex(0);
      setFocusIndex(0);
      lastAutoscrollKeyRef.current = "";
      if (navigateToDashboard && pathname !== "/dashboard") {
        navigate("/dashboard");
      }
    },
    [navigate, pathname]
  );

  const goNext = useCallback(() => {
    if (!isDemoMode) return;
    if (focusIndex < currentFocuses.length - 1) {
      setFocusIndex((current) => current + 1);
      return;
    }
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      setFocusIndex(0);
      return;
    }
    finishDemo();
  }, [currentFocuses.length, finishDemo, focusIndex, isDemoMode, stepIndex, steps.length]);

  const goBack = useCallback(() => {
    if (!isDemoMode) return;
    if (focusIndex > 0) {
      setFocusIndex((current) => current - 1);
      return;
    }
    if (stepIndex > 0) {
      const previousStep = steps[stepIndex - 1];
      setStepIndex((current) => current - 1);
      setFocusIndex(Math.max((previousStep?.focuses?.length || 1) - 1, 0));
    }
  }, [focusIndex, isDemoMode, stepIndex, steps]);

  useEffect(() => {
    if (!isDemoMode || !currentStep?.route) return;
    if (pathname === currentStep.route) return;
    navigate(currentStep.route);
  }, [currentStep?.route, isDemoMode, navigate, pathname]);

  useEffect(() => {
    if (!isDemoMode || !currentTargetId || typeof document === "undefined") return undefined;

    let cancelled = false;
    let attempts = 0;
    const autoscrollKey = `${pathname}:${currentTargetId}`;

    const scrollToTarget = () => {
      if (cancelled) return;
      const target = document.querySelector(`[data-demo-id="${currentTargetId}"]`);
      if (!target) {
        if (attempts < 18) {
          attempts += 1;
          window.setTimeout(scrollToTarget, 150);
        }
        return;
      }

      if (lastAutoscrollKeyRef.current === autoscrollKey) return;
      lastAutoscrollKeyRef.current = autoscrollKey;
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    };

    const timer = window.setTimeout(scrollToTarget, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentTargetId, isDemoMode, pathname]);

  const reportCue = useMemo(() => {
    if (!isDemoMode || currentStep?.id !== "reports") return null;
    return currentFocus?.reportKey
      ? { key: `${stepIndex}:${focusIndex}`, reportKey: currentFocus.reportKey }
      : null;
  }, [currentFocus, currentStep?.id, focusIndex, isDemoMode, stepIndex]);

  const assistantCue = useMemo(() => {
    if (!isDemoMode || currentStep?.id !== "assistant") return null;
    return currentStep.demoPrompt
      ? { key: `${stepIndex}:${focusIndex}`, prompt: currentStep.demoPrompt }
      : null;
  }, [currentStep, focusIndex, isDemoMode, stepIndex]);

  const value = useMemo(
    () => ({
      isDemoMode,
      steps,
      currentStep,
      currentFocus,
      currentTargetId,
      currentMainStepNumber: isDemoMode ? stepIndex + 1 : 0,
      currentFocusNumber: currentFocuses.length > 0 ? focusIndex + 1 : 0,
      currentFocusCount: currentFocuses.length,
      mainStepCount,
      demoPolicy,
      demoPolicyRoute,
      startDemo,
      finishDemo,
      skipDemo: finishDemo,
      goNext,
      goBack,
      hasPrevious,
      hasNext,
      assistantCue,
      reportCue,
    }),
    [
      assistantCue,
      currentFocus,
      currentFocuses.length,
      currentStep,
      currentTargetId,
      demoPolicy,
      demoPolicyRoute,
      finishDemo,
      focusIndex,
      goBack,
      goNext,
      hasNext,
      hasPrevious,
      isDemoMode,
      mainStepCount,
      reportCue,
      startDemo,
      stepIndex,
      steps,
    ]
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  const value = useContext(DemoModeContext);
  if (!value) {
    throw new Error("useDemoMode must be used within DemoModeProvider.");
  }
  return value;
}

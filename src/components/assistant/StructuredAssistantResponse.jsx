import StatusBadge from "../shared/StatusBadge";
import AssistantJumpLinks from "./AssistantJumpLinks";

function sectionTitleStyle() {
  return {
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
  };
}

function factCardStyle() {
  return {
    padding: "10px 12px",
    borderRadius: "12px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "grid",
    gap: "4px",
  };
}

function toneFromConfidence(confidence = "") {
  if (confidence === "high") return "good";
  if (confidence === "medium") return "warning";
  return "info";
}

function normalizeFacts(response = {}) {
  const supportingData = response.supportingData || response.supporting_data || {};
  const facts = Array.isArray(supportingData.facts) ? supportingData.facts : [];
  if (facts.length > 0) return facts;

  const scalarEntries = Object.entries(supportingData)
    .filter(([key]) => !["facts", "why", "uncertainties", "review_focus"].includes(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 6);

  return scalarEntries.map(([label, value]) => ({
    label: label.replace(/_/g, " "),
    value: Array.isArray(value) ? value.join(", ") : String(value),
  }));
}

function normalizeList(primary, fallback = []) {
  if (Array.isArray(primary) && primary.length > 0) return primary.filter(Boolean);
  return Array.isArray(fallback) ? fallback.filter(Boolean) : [];
}

export default function StructuredAssistantResponse({
  response,
  type = "",
  comparisonActive = false,
  sectionLabels = {},
  onJumpToSection,
}) {
  const whyThisRead = normalizeList(
    response?.whyThisRead || response?.why_this_read,
    response?.supportingData?.why || response?.supporting_data?.why
  );
  const facts = normalizeFacts(response);
  const uncertainties = normalizeList(
    response?.uncertainties,
    response?.supportingData?.uncertainties || response?.supporting_data?.uncertainties
  );
  const safeReviewFocus = normalizeList(
    response?.safeReviewFocus || response?.safe_review_focus,
    response?.supportingData?.review_focus || response?.supporting_data?.review_focus
  );
  const sourceLabel =
    response?.sourceMetadata?.label ||
    response?.source_metadata?.label ||
    response?.source ||
    null;
  const uncertaintySummary = response?.uncertainty || null;
  const sectionTargets = normalizeList(response?.sectionTargets);

  return (
    <>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {type ? <StatusBadge label={`Type: ${type.replace(/_/g, " ")}`} tone="info" /> : null}
        {response?.confidence ? (
          <StatusBadge
            label={`Confidence: ${response.confidence}`}
            tone={toneFromConfidence(response.confidence)}
          />
        ) : null}
        {comparisonActive ? <StatusBadge label="Comparison active" tone="warning" /> : null}
        {sourceLabel ? (
          <StatusBadge label={`Source: ${String(sourceLabel).replace(/_/g, " ")}`} tone="info" />
        ) : null}
      </div>

      <div>
        <div style={sectionTitleStyle()}>Direct Answer</div>
        <div style={{ marginTop: "6px", whiteSpace: "pre-wrap" }}>{response?.answer}</div>
      </div>

      {whyThisRead.length > 0 ? (
        <div>
          <div style={sectionTitleStyle()}>Why This Read</div>
          <ul style={{ margin: "8px 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569" }}>
            {whyThisRead.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {facts.length > 0 ? (
        <div>
          <div style={sectionTitleStyle()}>Supporting Data</div>
          <div
            style={{
              marginTop: "8px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "8px",
            }}
          >
            {facts.map((fact) => (
              <div key={`${fact.label}-${fact.value}`} style={factCardStyle()}>
                <div style={sectionTitleStyle()}>{fact.label}</div>
                <div style={{ color: "#0f172a", fontWeight: 700 }}>{fact.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {uncertaintySummary ? (
        <div>
          <div style={sectionTitleStyle()}>Uncertainty</div>
          <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
            {uncertaintySummary}
          </div>
        </div>
      ) : null}

      {uncertainties.length > 0 ? (
        <div>
          <div style={sectionTitleStyle()}>What Is Uncertain</div>
          <ul style={{ margin: "8px 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569" }}>
            {uncertainties.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {safeReviewFocus.length > 0 ? (
        <div>
          <div style={sectionTitleStyle()}>Safe Review Focus</div>
          <ul style={{ margin: "8px 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569" }}>
            {safeReviewFocus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <AssistantJumpLinks
        sectionTargets={sectionTargets}
        sectionLabels={sectionLabels}
        onJumpToSection={onJumpToSection}
      />
    </>
  );
}

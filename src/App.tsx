import { useMemo, useRef, useState } from "react";
import { exportCardBytes, importCardBytes, updateCardField } from "./core/card";
import { downloadBytes, editedFileName } from "./core/download";
import { platformProfiles, resolvePronounMacros, type PlatformId, type PreviewPronouns } from "./core/macros";
import { analyzeText, applyHighConfidenceWithDetails, applyProposal } from "./core/rules";
import { buildChangeSummary, findingKey, type LoggedFinding } from "./core/summary";
import type { EditProposal, ImportedCard } from "./core/types";

type WorkspaceTab = "edit" | "review" | "preview" | "summary";
const releaseLabel = `v${__APP_VERSION__} alpha`;

function safeMarkup(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  return escaped
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

function formatSize(length: number): string {
  if (length < 1024) return `${length} B`;
  if (length < 1024 * 1024) return `${(length / 1024).toFixed(1)} KB`;
  return `${(length / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<ImportedCard | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [tab, setTab] = useState<WorkspaceTab>("edit");
  const [fromPlatform, setFromPlatform] = useState<PlatformId>("janitor");
  const [toPlatform, setToPlatform] = useState<PlatformId>("wyvern");
  const [previewPronouns, setPreviewPronouns] = useState<PreviewPronouns>("she");
  const [message, setMessage] = useState("No file loaded");
  const [accepted, setAccepted] = useState<LoggedFinding[]>([]);
  const [ignored, setIgnored] = useState<LoggedFinding[]>([]);
  const [manualFieldIds, setManualFieldIds] = useState<Set<string>>(new Set());

  const selectedField = workspace?.fields.find((field) => field.id === selectedFieldId) ?? workspace?.fields[0];
  const fieldFindings = useMemo(
    () => selectedField ? analyzeText(selectedField.value, fromPlatform, toPlatform) : [],
    [selectedField, fromPlatform, toPlatform]
  );
  const proposals = useMemo(
    () => selectedField
      ? fieldFindings.filter((proposal) => !ignored.some((entry) => findingKey(entry.fieldId, entry.proposal) === findingKey(selectedField.id, proposal)))
      : [],
    [selectedField, fieldFindings, ignored]
  );
  const changedFields = workspace?.fields.filter((field) => field.value !== field.originalValue).length ?? 0;
  const changeSummary = useMemo(
    () => workspace ? buildChangeSummary(workspace, fromPlatform, toPlatform, accepted, ignored, manualFieldIds) : null,
    [workspace, fromPlatform, toPlatform, accepted, ignored, manualFieldIds]
  );

  async function loadFile(file: File): Promise<void> {
    try {
      const imported = importCardBytes(file.name, new Uint8Array(await file.arrayBuffer()));
      setWorkspace(imported);
      setSelectedFieldId(imported.fields[0]?.id ?? "");
      setAccepted([]);
      setIgnored([]);
      setManualFieldIds(new Set());
      setTab("edit");
      const warningSummary = imported.warnings.length > 0 ? ` · ${imported.warnings.length} warning${imported.warnings.length === 1 ? "" : "s"}` : "";
      setMessage(`${imported.version.toUpperCase()} ${imported.source.toUpperCase()} loaded locally${warningSummary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The card could not be opened.");
    }
  }

  function changeSelectedField(value: string, source: "manual" | "proposal" | "restore", applied: EditProposal[] = []): void {
    if (!workspace || !selectedField) return;
    setWorkspace(updateCardField(workspace, selectedField.path, value));
    setIgnored((entries) => entries.filter((entry) => entry.fieldId !== selectedField.id));
    if (source === "restore") {
      setAccepted((entries) => entries.filter((entry) => entry.fieldId !== selectedField.id));
      setManualFieldIds((ids) => {
        const next = new Set(ids);
        next.delete(selectedField.id);
        return next;
      });
      return;
    }
    if (source === "manual") {
      setManualFieldIds((ids) => {
        const next = new Set(ids);
        if (value === selectedField.originalValue) next.delete(selectedField.id);
        else next.add(selectedField.id);
        return next;
      });
      if (value === selectedField.originalValue) setAccepted((entries) => entries.filter((entry) => entry.fieldId !== selectedField.id));
    }
    if (source === "proposal" && applied.length > 0) {
      setAccepted((entries) => [
        ...entries,
        ...applied.map((proposal) => ({ fieldId: selectedField.id, fieldLabel: selectedField.label, proposal }))
      ]);
    }
  }

  function accept(proposal: EditProposal): void {
    if (!selectedField) return;
    try {
      changeSelectedField(applyProposal(selectedField.value, proposal), "proposal", [proposal]);
      setMessage(`Applied: ${proposal.explanation}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The suggestion could not be applied.");
    }
  }

  function acceptSafe(): void {
    if (!selectedField) return;
    const result = applyHighConfidenceWithDetails(selectedField.value, proposals);
    changeSelectedField(result.text, "proposal", result.applied);
    setMessage(`Applied ${result.applied.length} high-confidence change${result.applied.length === 1 ? "" : "s"} in this field.`);
  }

  function resetField(): void {
    if (!selectedField) return;
    changeSelectedField(selectedField.originalValue, "restore");
    setMessage("Restored this field to its imported text.");
  }

  function ignore(proposal: EditProposal): void {
    if (!selectedField) return;
    const entry = { fieldId: selectedField.id, fieldLabel: selectedField.label, proposal };
    setIgnored((entries) => entries.some((current) => findingKey(current.fieldId, current.proposal) === findingKey(entry.fieldId, entry.proposal)) ? entries : [...entries, entry]);
  }

  function exportFile(): void {
    if (!workspace) return;
    try {
      const bytes = exportCardBytes(workspace);
      const verified = importCardBytes(workspace.fileName, bytes);
      if (JSON.stringify(verified.card) !== JSON.stringify(workspace.card)) {
        throw new Error("The exported card did not pass the re-import verification.");
      }
      downloadBytes(bytes, editedFileName(workspace.fileName), workspace.source === "png" ? "image/png" : "application/json");
      setMessage("Export verified and download started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }

  const resolvedPreview = selectedField ? resolvePronounMacros(selectedField.value, previewPronouns) : "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">LOCAL CHARACTER CARD WORKBENCH</div>
          <div className="product-title"><h1>Cardsmith</h1><span>{releaseLabel}</span></div>
        </div>
        <div className="privacy-pill"><span aria-hidden="true">●</span> On-device only</div>
      </header>

      {!workspace ? (
        <section className="empty-workspace">
          <div className="empty-mark" aria-hidden="true">{`{{...}}`}</div>
          <h2>Open a character card</h2>
          <p>Choose a PNG or JSON card. Its contents stay in this browser and are not uploaded.</p>
          <button className="primary large" onClick={() => fileInput.current?.click()}>Choose card</button>
          <p className="supporting">Character Card V1, V2, and V3 detection · PNG metadata CRC validation</p>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".png,.json,image/png,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadFile(file);
          }} />
        </section>
      ) : (
        <>
          <section className="filebar" aria-label="Loaded card">
            <div className="file-identity">
              <span className="file-badge">{workspace.source.toUpperCase()}</span>
              <div><strong>{workspace.fileName}</strong><small>{workspace.version.toUpperCase()} · {formatSize(workspace.originalBytes.length)} · {workspace.fields.length} editable fields</small></div>
            </div>
            <div className="file-actions">
              <button className="secondary" onClick={() => fileInput.current?.click()}>Open another card</button>
              <button className="primary" onClick={() => setTab("summary")}>Review export</button>
            </div>
            <input ref={fileInput} className="visually-hidden" type="file" accept=".png,.json,image/png,application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }} />
          </section>

          {workspace.warnings.length > 0 && (
            <section className="warning-panel" aria-label="Import warnings">
              <div className="warning-heading"><span aria-hidden="true">!</span><strong>Review this import</strong></div>
              <ul>{workspace.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </section>
          )}

          <nav className="tabs" aria-label="Workspace views">
            {(["edit", "review", "preview", "summary"] as WorkspaceTab[]).map((item) => (
              <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
                {item === "review" && proposals.length > 0 ? `Review (${proposals.length})` : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </nav>

          <section className="workspace-grid">
            <aside className="field-list">
              <div className="panel-heading"><span>Card fields</span><span>{changedFields} changed</span></div>
              {workspace.fields.map((field) => (
                <button key={field.id} className={selectedField?.id === field.id ? "field active" : "field"} onClick={() => {
                  setSelectedFieldId(field.id);
                }}>
                  <span>{field.label}</span>
                  {field.value !== field.originalValue && <i title="Changed">●</i>}
                </button>
              ))}
              {workspace.fields.length === 0 && <p className="muted padded">No recognized editable fields were found.</p>}
            </aside>

            <section className="work-panel">
              {selectedField && tab === "edit" && (
                <>
                  <div className="panel-heading">
                    <div><span>{selectedField.label}</span><small>{selectedField.value.length.toLocaleString()} characters</small></div>
                    <button className="text-button" disabled={selectedField.value === selectedField.originalValue} onClick={resetField}>Restore field</button>
                  </div>
                  <textarea className="editor" spellCheck="true" value={selectedField.value} onChange={(event) => changeSelectedField(event.target.value, "manual")} aria-label={`Edit ${selectedField.label}`} />
                </>
              )}

              {selectedField && tab === "review" && (
                <>
                  <div className="rule-controls">
                    <label>Convert from<select value={fromPlatform} onChange={(event) => { setFromPlatform(event.target.value as PlatformId); setIgnored([]); }}>{Object.values(platformProfiles).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                    <span aria-hidden="true">→</span>
                    <label>Convert to<select value={toPlatform} onChange={(event) => { setToPlatform(event.target.value as PlatformId); setIgnored([]); }}>{Object.values(platformProfiles).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                    <button className="secondary" disabled={!proposals.some((item) => item.actionable && item.confidence === "high")} onClick={acceptSafe}>Apply safe changes</button>
                  </div>
                  <div className="proposal-list">
                    {proposals.map((proposal) => (
                      <article className="proposal" key={proposal.id}>
                        <div className="proposal-meta"><span className={`confidence ${proposal.actionable ? proposal.confidence : "unresolved"}`}>{proposal.actionable ? proposal.confidence : "No target equivalent"}</span><span>{proposal.category}</span></div>
                        <p>{proposal.explanation}</p>
                        <div className={proposal.actionable ? "replacement" : "replacement unresolved-replacement"}><del>{proposal.before}</del><span aria-hidden="true">→</span><ins>{proposal.actionable ? proposal.after || "Remove formatting" : "Preserved exactly"}</ins></div>
                        <div className="proposal-actions">{proposal.actionable && <button className="primary small" onClick={() => accept(proposal)}>Accept</button>}<button className="secondary small" onClick={() => ignore(proposal)}>Ignore</button></div>
                      </article>
                    ))}
                    {proposals.length === 0 && fromPlatform === toPlatform && fieldFindings.length === 0 && <div className="clean-state"><span>↔</span><h2>No macro conversion active</h2><p>The source and target profiles match. Other checks found nothing in this field.</p></div>}
                    {proposals.length === 0 && fromPlatform !== toPlatform && fieldFindings.length === 0 && <div className="clean-state"><span>✓</span><h2>No findings</h2><p>No applicable conversion or formatting findings remain in this field.</p></div>}
                    {proposals.length === 0 && fieldFindings.length > 0 && <div className="clean-state"><span>✓</span><h2>All findings reviewed</h2><p>The findings in this field were applied or ignored.</p></div>}
                  </div>
                </>
              )}

              {selectedField && tab === "preview" && (
                <>
                  <div className="preview-controls"><label>Resolve macros as<select value={previewPronouns} onChange={(event) => setPreviewPronouns(event.target.value as PreviewPronouns)}><option value="she">she / her</option><option value="he">he / him</option><option value="they">they / them</option></select></label></div>
                  <div className="preview-columns">
                    <section><h2>Imported</h2><div className="rendered" dangerouslySetInnerHTML={{ __html: safeMarkup(selectedField.originalValue) }} /></section>
                    <section><h2>Edited and resolved</h2><div className="rendered" dangerouslySetInnerHTML={{ __html: safeMarkup(resolvedPreview) }} /></section>
                  </div>
                  <p className="preview-note">This is a safe approximation. Exact SillyTavern rendering compatibility will be added as a separate tested profile.</p>
                </>
              )}

              {changeSummary && tab === "summary" && (
                <div className="summary-panel">
                  <div className="panel-heading"><div><span>Whole-card export summary</span><small>Review the complete saved result before downloading</small></div></div>
                  {changeSummary.unresolved.length > 0 && <div className="summary-warning"><strong>Conversion is incomplete.</strong> {changeSummary.unresolved.length} recognized macro occurrence{changeSummary.unresolved.length === 1 ? " has" : "s have"} no target equivalent and will be preserved.</div>}
                  <div className="summary-facts">
                    <div><span>File</span><strong>{changeSummary.source.toUpperCase()} · {changeSummary.version.toUpperCase()}</strong></div>
                    <div><span>Profiles</span><strong>{changeSummary.fromProfile} → {changeSummary.toProfile}</strong></div>
                    <div><span>Changed fields</span><strong>{changeSummary.changedFields.length}</strong></div>
                    <div><span>Accepted proposals</span><strong>{changeSummary.accepted.length}</strong></div>
                  </div>
                  <div className="summary-sections">
                    <section><h2>Changed fields</h2>{changeSummary.changedFields.length > 0 ? <ul>{changeSummary.changedFields.map((field) => <li key={field.id}>{field.label}</li>)}</ul> : <p className="muted">No fields differ from the imported card.</p>}</section>
                    <section><h2>Accepted proposals by rule</h2>{changeSummary.acceptedByRule.length > 0 ? <ul>{changeSummary.acceptedByRule.map((rule) => <li key={`${rule.category}:${rule.ruleId}`}><code>{rule.category} · {rule.ruleId}</code><span>{rule.count}</span></li>)}</ul> : <p className="muted">No proposals were accepted.</p>}</section>
                    <section><h2>Manual edits</h2>{changeSummary.manualFields.length > 0 ? <ul>{changeSummary.manualFields.map((field) => <li key={field.id}>{field.label}</li>)}</ul> : <p className="muted">No changed fields contain manual edits.</p>}</section>
                    <section><h2>Ignored findings</h2>{changeSummary.ignored.length > 0 ? <ul>{changeSummary.ignored.map((entry) => <li key={findingKey(entry.fieldId, entry.proposal)}><span>{entry.fieldLabel}</span><code>{entry.proposal.before}</code></li>)}</ul> : <p className="muted">No findings were ignored.</p>}</section>
                    <section className="wide"><h2>Macros without target equivalents</h2>{changeSummary.unresolved.length > 0 ? <ul>{changeSummary.unresolved.map((entry) => <li key={findingKey(entry.fieldId, entry.proposal)}><span>{entry.fieldLabel}</span><code>{entry.proposal.before}</code><small>{entry.proposal.explanation}</small></li>)}</ul> : <p className="muted">Every recognized source macro has a target equivalent.</p>}</section>
                  </div>
                  <div className="summary-actions"><button className="primary" onClick={exportFile}>Download verified card</button><span>The generated file will be re-imported and compared before download.</span></div>
                </div>
              )}
            </section>
          </section>
        </>
      )}

      <footer className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("invalid") ? "status error" : "status"} aria-live="polite">
        <span>{message}</span>
        {workspace && <span>Original retained in memory · {changedFields} field{changedFields === 1 ? "" : "s"} changed</span>}
      </footer>
    </main>
  );
}

export default App;

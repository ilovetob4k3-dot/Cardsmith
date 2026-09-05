import { useMemo, useRef, useState } from "react";
import { exportCardBytes, importCardBytes, updateCardField } from "./core/card";
import { downloadBytes, editedFileName } from "./core/download";
import { platformProfiles, resolvePronounMacros, type PlatformId, type PreviewPronouns } from "./core/macros";
import { analyzeText, applyHighConfidence, applyProposal } from "./core/rules";
import type { EditProposal, ImportedCard } from "./core/types";

type WorkspaceTab = "edit" | "review" | "preview";

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
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const selectedField = workspace?.fields.find((field) => field.id === selectedFieldId) ?? workspace?.fields[0];
  const proposals = useMemo(
    () => selectedField ? analyzeText(selectedField.value, fromPlatform, toPlatform).filter((proposal) => !ignored.has(proposal.id)) : [],
    [selectedField, fromPlatform, toPlatform, ignored]
  );
  const changedFields = workspace?.fields.filter((field) => field.value !== field.originalValue).length ?? 0;

  async function loadFile(file: File): Promise<void> {
    try {
      const imported = importCardBytes(file.name, new Uint8Array(await file.arrayBuffer()));
      setWorkspace(imported);
      setSelectedFieldId(imported.fields[0]?.id ?? "");
      setIgnored(new Set());
      setTab("edit");
      setMessage(`${imported.version.toUpperCase()} ${imported.source.toUpperCase()} loaded locally`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The card could not be opened.");
    }
  }

  function changeSelectedField(value: string): void {
    if (!workspace || !selectedField) return;
    setWorkspace(updateCardField(workspace, selectedField.path, value));
    setIgnored(new Set());
  }

  function accept(proposal: EditProposal): void {
    if (!selectedField) return;
    try {
      changeSelectedField(applyProposal(selectedField.value, proposal));
      setMessage(`Applied: ${proposal.explanation}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The suggestion could not be applied.");
    }
  }

  function acceptSafe(): void {
    if (!selectedField) return;
    changeSelectedField(applyHighConfidence(selectedField.value, proposals));
    setMessage("Applied high-confidence changes in this field.");
  }

  function resetField(): void {
    if (!selectedField) return;
    changeSelectedField(selectedField.originalValue);
    setMessage("Restored this field to its imported text.");
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
          <h1>Cardsmith</h1>
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
              <button className="secondary" onClick={() => fileInput.current?.click()}>Replace</button>
              <button className="primary" onClick={exportFile}>Export edited card</button>
            </div>
            <input ref={fileInput} className="visually-hidden" type="file" accept=".png,.json,image/png,application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }} />
          </section>

          <nav className="tabs" aria-label="Workspace views">
            {(["edit", "review", "preview"] as WorkspaceTab[]).map((item) => (
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
                  setIgnored(new Set());
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
                  <textarea className="editor" spellCheck="true" value={selectedField.value} onChange={(event) => changeSelectedField(event.target.value)} aria-label={`Edit ${selectedField.label}`} />
                </>
              )}

              {selectedField && tab === "review" && (
                <>
                  <div className="rule-controls">
                    <label>Convert from<select value={fromPlatform} onChange={(event) => setFromPlatform(event.target.value as PlatformId)}>{Object.values(platformProfiles).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                    <span aria-hidden="true">→</span>
                    <label>Convert to<select value={toPlatform} onChange={(event) => setToPlatform(event.target.value as PlatformId)}>{Object.values(platformProfiles).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                    <button className="secondary" disabled={!proposals.some((item) => item.confidence === "high")} onClick={acceptSafe}>Apply safe changes</button>
                  </div>
                  <div className="proposal-list">
                    {proposals.map((proposal) => (
                      <article className="proposal" key={proposal.id}>
                        <div className="proposal-meta"><span className={`confidence ${proposal.confidence}`}>{proposal.confidence}</span><span>{proposal.category}</span></div>
                        <p>{proposal.explanation}</p>
                        <div className="replacement"><del>{proposal.before}</del><span aria-hidden="true">→</span><ins>{proposal.after || "Remove formatting"}</ins></div>
                        <div className="proposal-actions"><button className="primary small" onClick={() => accept(proposal)}>Accept</button><button className="secondary small" onClick={() => setIgnored(new Set([...ignored, proposal.id]))}>Ignore</button></div>
                      </article>
                    ))}
                    {proposals.length === 0 && <div className="clean-state"><span>✓</span><h2>No current suggestions</h2><p>This field has no findings from the enabled foundation rules.</p></div>}
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

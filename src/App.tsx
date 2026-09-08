import { useEffect, useMemo, useRef, useState } from "react";
import { exportCardBytes, importCardBytes, updateCardField } from "./core/card";
import {
  analyzeCard,
  applyHighConfidenceToCard,
  countFindingCategories,
  openCardFindings,
  safeCardFindings
} from "./core/cardReview";
import { DOWNLOAD_REVOKE_DELAY_MS, downloadBytes, editedFileName, ledgerFileName, type DownloadReceipt } from "./core/download";
import { macroReferenceRows, platformProfiles, type PlatformId, type PreviewPronouns } from "./core/macros";
import type { ThoughtConvention } from "./core/markdown";
import { renderPreview, type PreviewMode } from "./core/preview";
import type { GenderShift, PronounOutputTarget, ReferentScope } from "./core/pronouns";
import { applyHighConfidenceWithDetails, applyProposal, type AnalysisOptions } from "./core/rules";
import {
  buildChangeSummary,
  findingKey,
  summaryToJson,
  summaryToMarkdown,
  type LoggedFinding
} from "./core/summary";
import type { EditProposal, ImportedCard } from "./core/types";

type WorkspaceTab = "edit" | "review" | "preview" | "reference" | "summary";
type ChangeSource = "manual" | "proposal" | "restore";

interface PendingSelection {
  fieldId: string;
  start: number;
  end: number;
}

interface CardWideUndo {
  workspace: ImportedCard;
  accepted: LoggedFinding[];
  ignored: LoggedFinding[];
  manualFieldIds: Set<string>;
}

interface FindingCardProps {
  entry: LoggedFinding;
  ignored?: boolean;
  onAccept?: () => void;
  onIgnore?: () => void;
  onRestore?: () => void;
  onOpen?: () => void;
}

const releaseLabel = `v${__APP_VERSION__} alpha`;

function safeMarkup(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
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

function FindingCard({ entry, ignored, onAccept, onIgnore, onRestore, onOpen }: FindingCardProps) {
  const proposal = entry.proposal;
  const findingLabel = proposal.findingLabel ?? (proposal.category === "macro" ? "No target equivalent" : "Manual review");
  return (
    <article className={ignored ? "proposal ignored-proposal" : "proposal"}>
      <div className="proposal-meta">
        <span className={`confidence ${ignored ? "ignored" : proposal.actionable ? proposal.confidence : "unresolved"}`}>
          {ignored ? "Ignored" : proposal.actionable ? proposal.confidence : findingLabel}
        </span>
        <span>{proposal.category}</span>
      </div>
      <p>{proposal.explanation}</p>
      <div className={proposal.actionable ? "replacement" : "replacement unresolved-replacement"}>
        <del>{proposal.before}</del>
        <span aria-hidden="true">→</span>
        <ins>{proposal.actionable ? proposal.after || "Remove formatting" : "Preserved exactly"}</ins>
      </div>
      <div className="proposal-actions">
        {!ignored && proposal.actionable && onAccept && <button className="primary small" onClick={onAccept}>Accept</button>}
        {!ignored && onIgnore && <button className="secondary small" onClick={onIgnore}>Ignore</button>}
        {ignored && onRestore && <button className="secondary small" onClick={onRestore}>Restore finding</button>}
        {onOpen && <button className="text-button small" onClick={onOpen}>Open in editor</button>}
      </div>
    </article>
  );
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [workspace, setWorkspace] = useState<ImportedCard | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [tab, setTab] = useState<WorkspaceTab>("edit");
  const [reviewAll, setReviewAll] = useState(false);
  const [fromPlatform, setFromPlatform] = useState<PlatformId>("janitor");
  const [toPlatform, setToPlatform] = useState<PlatformId>("wyvern");
  const [previewPronouns, setPreviewPronouns] = useState<PreviewPronouns>("she");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("raw");
  const [formattingEnabled, setFormattingEnabled] = useState(true);
  const [thoughtConvention, setThoughtConvention] = useState<ThoughtConvention>("unchanged");
  const [pronounTarget, setPronounTarget] = useState<PronounOutputTarget>("off");
  const [referentScope, setReferentScope] = useState<ReferentScope>("user");
  const [referentName, setReferentName] = useState("");
  const [genderShift, setGenderShift] = useState<GenderShift>("off");
  const [reviewBodyDescriptors, setReviewBodyDescriptors] = useState(false);
  const [message, setMessage] = useState("No file loaded");
  const [accepted, setAccepted] = useState<LoggedFinding[]>([]);
  const [ignored, setIgnored] = useState<LoggedFinding[]>([]);
  const [manualFieldIds, setManualFieldIds] = useState<Set<string>>(new Set());
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [cardWideUndo, setCardWideUndo] = useState<CardWideUndo | null>(null);
  const [expandedReviewFields, setExpandedReviewFields] = useState<Set<string>>(new Set());
  const [downloadFallback, setDownloadFallback] = useState<DownloadReceipt | null>(null);

  const analysisOptions = useMemo<AnalysisOptions>(() => ({
    formatting: { enabled: formattingEnabled, thoughtConvention },
    pronouns: {
      target: pronounTarget,
      referent: referentScope,
      name: referentName,
      genderShift,
      reviewBodyDescriptors
    }
  }), [formattingEnabled, thoughtConvention, pronounTarget, referentScope, referentName, genderShift, reviewBodyDescriptors]);

  const selectedField = workspace?.fields.find((field) => field.id === selectedFieldId) ?? workspace?.fields[0];
  const cardReviews = useMemo(
    () => workspace ? analyzeCard(workspace, fromPlatform, toPlatform, analysisOptions) : [],
    [workspace, fromPlatform, toPlatform, analysisOptions]
  );
  const allOpenFindings = useMemo(() => openCardFindings(cardReviews, ignored), [cardReviews, ignored]);
  const allSafeFindings = useMemo(() => safeCardFindings(cardReviews, ignored), [cardReviews, ignored]);
  const safeCategoryCounts = useMemo(() => countFindingCategories(allSafeFindings), [allSafeFindings]);
  const selectedReview = cardReviews.find((review) => review.fieldId === selectedField?.id);
  const fieldFindings = selectedReview?.findings ?? [];
  const proposals = selectedField
    ? allOpenFindings.filter((entry) => entry.fieldId === selectedField.id).map((entry) => entry.proposal)
    : [];
  const selectedAccepted = selectedField ? accepted.filter((entry) => entry.fieldId === selectedField.id) : [];
  const selectedIgnored = selectedField ? ignored.filter((entry) => entry.fieldId === selectedField.id) : [];
  const changedFields = cardReviews.filter((review) => review.dirty).length;
  const unresolvedCount = cardReviews.reduce((count, review) => count + review.findings.filter((proposal) => !proposal.actionable && proposal.category === "macro").length, 0);
  const manualReviewCount = allOpenFindings.filter((entry) => !entry.proposal.actionable && entry.proposal.category !== "macro").length;
  const changeSummary = useMemo(
    () => workspace && tab === "summary" ? buildChangeSummary(workspace, fromPlatform, toPlatform, accepted, ignored, manualFieldIds, analysisOptions) : null,
    [workspace, tab, fromPlatform, toPlatform, accepted, ignored, manualFieldIds, analysisOptions]
  );
  const reviewFields = useMemo(() => workspace?.fields.map((field) => ({
    field,
    open: allOpenFindings.filter((entry) => entry.fieldId === field.id),
    accepted: accepted.filter((entry) => entry.fieldId === field.id),
    ignored: ignored.filter((entry) => entry.fieldId === field.id)
  })).filter((review) => review.open.length + review.accepted.length + review.ignored.length > 0 || review.field.value !== review.field.originalValue) ?? [], [workspace, allOpenFindings, accepted, ignored]);

  useEffect(() => {
    if (!pendingSelection || pendingSelection.fieldId !== selectedField?.id || tab !== "edit") return;
    const target = editor.current;
    if (!target) return;
    target.focus();
    target.setSelectionRange(pendingSelection.start, pendingSelection.end);
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    setPendingSelection(null);
  }, [pendingSelection, selectedField?.id, tab]);

  useEffect(() => {
    if (!downloadFallback) return;
    const timeout = window.setTimeout(() => {
      setDownloadFallback((current) => current?.url === downloadFallback.url ? null : current);
    }, DOWNLOAD_REVOKE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [downloadFallback]);

  async function loadFile(file: File): Promise<void> {
    try {
      const imported = importCardBytes(file.name, new Uint8Array(await file.arrayBuffer()));
      setWorkspace(imported);
      setSelectedFieldId(imported.fields[0]?.id ?? "");
      setAccepted([]);
      setIgnored([]);
      setManualFieldIds(new Set());
      setCardWideUndo(null);
      setExpandedReviewFields(new Set(imported.fields[0] ? [imported.fields[0].id] : []));
      setReviewAll(false);
      setDownloadFallback(null);
      setTab("edit");
      const warningSummary = imported.warnings.length > 0 ? ` · ${imported.warnings.length} warning${imported.warnings.length === 1 ? "" : "s"}` : "";
      setMessage(`${imported.version.toUpperCase()} ${imported.source.toUpperCase()} loaded locally${warningSummary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The card could not be opened.");
    }
  }

  function changeField(fieldId: string, value: string, source: ChangeSource, applied: EditProposal[] = []): void {
    if (!workspace) return;
    const field = workspace.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return;
    setWorkspace(updateCardField(workspace, field.path, value));
    setIgnored((entries) => entries.filter((entry) => entry.fieldId !== field.id));
    setCardWideUndo(null);
    if (source === "restore") {
      setAccepted((entries) => entries.filter((entry) => entry.fieldId !== field.id));
      setManualFieldIds((ids) => {
        const next = new Set(ids);
        next.delete(field.id);
        return next;
      });
      return;
    }
    if (source === "manual") {
      setManualFieldIds((ids) => {
        const next = new Set(ids);
        if (value === field.originalValue) next.delete(field.id);
        else next.add(field.id);
        return next;
      });
      if (value === field.originalValue) setAccepted((entries) => entries.filter((entry) => entry.fieldId !== field.id));
    }
    if (source === "proposal" && applied.length > 0) {
      setAccepted((entries) => [
        ...entries,
        ...applied.map((proposal) => ({ fieldId: field.id, fieldLabel: field.label, proposal }))
      ]);
    }
  }

  function acceptFinding(entry: LoggedFinding): void {
    if (!workspace) return;
    const field = workspace.fields.find((candidate) => candidate.id === entry.fieldId);
    if (!field) return;
    try {
      changeField(field.id, applyProposal(field.value, entry.proposal), "proposal", [entry.proposal]);
      setMessage(`Applied in ${field.label}: ${entry.proposal.explanation}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The suggestion could not be applied.");
    }
  }

  function acceptSafeField(): void {
    if (!selectedField) return;
    const result = applyHighConfidenceWithDetails(selectedField.value, proposals);
    changeField(selectedField.id, result.text, "proposal", result.applied);
    setMessage(`Applied ${result.applied.length} high-confidence change${result.applied.length === 1 ? "" : "s"} in ${selectedField.label}.`);
  }

  function applySafeAcrossCard(): void {
    if (!workspace || allSafeFindings.length === 0) return;
    const snapshot: CardWideUndo = { workspace, accepted, ignored, manualFieldIds: new Set(manualFieldIds) };
    const result = applyHighConfidenceToCard(workspace, fromPlatform, toPlatform, ignored, analysisOptions);
    setWorkspace(result.workspace);
    setAccepted((entries) => [...entries, ...result.applied]);
    const affected = new Set(result.applied.map((entry) => entry.fieldId));
    setIgnored((entries) => entries.filter((entry) => !affected.has(entry.fieldId)));
    setCardWideUndo(snapshot);
    setMessage(`Applied ${result.applied.length} safe change${result.applied.length === 1 ? "" : "s"} across the card. One-step undo is available.`);
  }

  function undoSafeAcrossCard(): void {
    if (!cardWideUndo) return;
    setWorkspace(cardWideUndo.workspace);
    setAccepted(cardWideUndo.accepted);
    setIgnored(cardWideUndo.ignored);
    setManualFieldIds(new Set(cardWideUndo.manualFieldIds));
    setCardWideUndo(null);
    setMessage("Undid the last card-wide safe apply.");
  }

  function resetField(): void {
    if (!selectedField) return;
    changeField(selectedField.id, selectedField.originalValue, "restore");
    setMessage("Restored this field to its imported text.");
  }

  function ignoreFinding(entry: LoggedFinding): void {
    setIgnored((entries) => entries.some((current) => findingKey(current.fieldId, current.proposal) === findingKey(entry.fieldId, entry.proposal)) ? entries : [...entries, entry]);
    setCardWideUndo(null);
    setMessage(`Ignored one finding in ${entry.fieldLabel}.`);
  }

  function restoreFinding(entry: LoggedFinding): void {
    const key = findingKey(entry.fieldId, entry.proposal);
    setIgnored((entries) => entries.filter((current) => findingKey(current.fieldId, current.proposal) !== key));
    setCardWideUndo(null);
    setMessage(`Restored one finding in ${entry.fieldLabel}.`);
  }

  function openFindingInEditor(entry: LoggedFinding): void {
    setSelectedFieldId(entry.fieldId);
    setReviewAll(false);
    setPendingSelection({ fieldId: entry.fieldId, start: entry.proposal.start, end: entry.proposal.end });
    setTab("edit");
    setMessage(`Opened ${entry.fieldLabel} at the selected finding.`);
  }

  function changeProfile(side: "from" | "to", value: PlatformId): void {
    if (side === "from") setFromPlatform(value);
    else setToPlatform(value);
    setIgnored([]);
    setCardWideUndo(null);
  }

  function resetAnalysisState(): void {
    setIgnored([]);
    setCardWideUndo(null);
  }

  function exportFile(): void {
    if (!workspace) return;
    setDownloadFallback(null);
    try {
      const bytes = exportCardBytes(workspace);
      const verified = importCardBytes(workspace.fileName, bytes);
      if (JSON.stringify(verified.card) !== JSON.stringify(workspace.card)) {
        throw new Error("The exported card did not pass the re-import verification.");
      }
      setDownloadFallback(downloadBytes(bytes, editedFileName(workspace.fileName), workspace.source === "png" ? "image/png" : "application/json"));
      setMessage("Export verified and download started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }

  function exportLedger(format: "md" | "json"): void {
    if (!workspace || !changeSummary) return;
    setDownloadFallback(null);
    try {
      const content = format === "md"
        ? summaryToMarkdown(changeSummary, workspace.fileName)
        : summaryToJson(changeSummary, workspace.fileName);
      setDownloadFallback(downloadBytes(new TextEncoder().encode(content), ledgerFileName(workspace.fileName, format), format === "md" ? "text/markdown" : "application/json"));
      setMessage(`${format.toUpperCase()} change ledger download started.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ledger download failed.");
    }
  }

  async function copyText(value: string): Promise<void> {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch { /* Try the browser's legacy local-copy path below. */ }
    if (!copied) {
      const helper = document.createElement("textarea");
      try {
        helper.value = value;
        helper.className = "clipboard-helper";
        document.body.append(helper);
        helper.select();
        copied = document.execCommand("copy");
      } catch { copied = false; }
      finally { helper.remove(); }
    }
    setMessage(copied ? `Copied ${value}.` : "Clipboard access was blocked. Select the macro text and copy it manually.");
  }

  const previewResult = selectedField ? renderPreview(selectedField.value, previewMode, previewPronouns) : null;

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
          <input ref={fileInput} className="visually-hidden" type="file" accept=".png,.json,image/png,application/json" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => {
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
            <input ref={fileInput} className="visually-hidden" type="file" accept=".png,.json,image/png,application/json" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => {
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
            {(["edit", "review", "preview", "reference", "summary"] as WorkspaceTab[]).map((item) => (
              <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
                {item === "review" && allOpenFindings.length > 0 ? `Review (${allOpenFindings.length})` : item === "reference" ? "Macros" : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </nav>

          <label className="mobile-field-picker">
            <span>Card field</span>
            <select value={selectedField?.id ?? ""} onChange={(event) => setSelectedFieldId(event.target.value)}>
              {workspace.fields.map((field) => {
                const count = allOpenFindings.filter((entry) => entry.fieldId === field.id).length;
                const dirty = field.value !== field.originalValue;
                return <option key={field.id} value={field.id}>{field.label}{count ? ` · ${count} finding${count === 1 ? "" : "s"}` : ""}{dirty ? " · changed" : ""}</option>;
              })}
            </select>
          </label>

          <section className="workspace-grid">
            <aside className="field-list">
              <div className="panel-heading"><span>Card fields</span><span>{changedFields} changed</span></div>
              {workspace.fields.map((field) => {
                const count = allOpenFindings.filter((entry) => entry.fieldId === field.id).length;
                return (
                  <button key={field.id} className={selectedField?.id === field.id ? "field active" : "field"} onClick={() => setSelectedFieldId(field.id)}>
                    <span>{field.label}</span>
                    <span className="field-indicators">{count > 0 && <b title={`${count} open findings`}>{count}</b>}{field.value !== field.originalValue && <i title="Changed">●</i>}</span>
                  </button>
                );
              })}
              {workspace.fields.length === 0 && <p className="muted padded">No recognized editable fields were found.</p>}
            </aside>

            <section className="work-panel">
              {selectedField && tab === "edit" && (
                <>
                  <div className="panel-heading">
                    <div><span>{selectedField.label}</span><small>{selectedField.value.length.toLocaleString()} characters</small></div>
                    <button className="text-button" disabled={selectedField.value === selectedField.originalValue} onClick={resetField}>Restore field</button>
                  </div>
                  <textarea ref={editor} className="editor" spellCheck="true" value={selectedField.value} onChange={(event) => changeField(selectedField.id, event.target.value, "manual")} aria-label={`Edit ${selectedField.label}`} />
                </>
              )}

              {selectedField && tab === "review" && (
                <>
                  <div className="rule-controls">
                    <label>Convert from<select value={fromPlatform} onChange={(event) => changeProfile("from", event.target.value as PlatformId)}>{Object.values(platformProfiles).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                    <span aria-hidden="true">→</span>
                    <label>Convert to<select value={toPlatform} onChange={(event) => changeProfile("to", event.target.value as PlatformId)}>{Object.values(platformProfiles).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                    {!reviewAll && <button className="secondary" disabled={!proposals.some((item) => item.actionable && item.confidence === "high")} onClick={acceptSafeField}>Apply safe changes</button>}
                    <button className="review-all-button" onClick={() => setReviewAll((value) => !value)}>{reviewAll ? "Current field" : `Review all fields (${allOpenFindings.length})`}</button>
                  </div>
                  <details className="analysis-settings">
                    <summary>Formatting and referent-aware checks</summary>
                    <div className="settings-grid">
                      <label className="checkbox-control"><input type="checkbox" checked={formattingEnabled} onChange={(event) => { setFormattingEnabled(event.target.checked); resetAnalysisState(); }} /><span>Formatting profile</span><small>Single-italic actions, plain dialogue, and backtick display cues</small></label>
                      <label>Thought convention<select value={thoughtConvention} disabled={!formattingEnabled} onChange={(event) => { setThoughtConvention(event.target.value as ThoughtConvention); resetAnalysisState(); }}><option value="unchanged">Leave thoughts unchanged</option><option value="backticks">Backticks</option><option value="italics">Single italics</option><option value="plain">Plain text</option></select></label>
                      <label>Plain pronoun output<select value={pronounTarget} onChange={(event) => { setPronounTarget(event.target.value as PronounOutputTarget); resetAnalysisState(); }}><option value="off">Off</option><option value="janitor">JanitorAI macros</option><option value="wyvern">Wyvern / ST extension macros</option><option value="she">she / her</option><option value="he">he / him</option><option value="they">they / them</option></select></label>
                      <label>Pronoun referent<select value={referentScope} onChange={(event) => { setReferentScope(event.target.value as ReferentScope); resetAnalysisState(); }}><option value="user">User only</option><option value="char">Character only</option><option value="named">Named person</option><option value="any-singular">Any singular referent</option></select></label>
                      {referentScope === "named" && <label>Person name<input value={referentName} onChange={(event) => { setReferentName(event.target.value); resetAnalysisState(); }} placeholder="Exact name" /></label>}
                      <label>Gendered terms<select value={genderShift} onChange={(event) => { setGenderShift(event.target.value as GenderShift); resetAnalysisState(); }}><option value="off">Off</option><option value="feminine">Feminine</option><option value="masculine">Masculine</option><option value="neutral">Neutral</option></select></label>
                      <label className="checkbox-control"><input type="checkbox" checked={reviewBodyDescriptors} onChange={(event) => { setReviewBodyDescriptors(event.target.checked); resetAnalysisState(); }} /><span>Flag body descriptors</span><small>Review-only; Cardsmith will not invent replacements</small></label>
                    </div>
                    <p>Formatting, pronoun, and gender suggestions always require individual approval. Ambiguous, plural, and unknown references are preserved.</p>
                  </details>

                  {!reviewAll && (
                    <div className="proposal-list">
                      {proposals.map((proposal) => {
                        const entry = { fieldId: selectedField.id, fieldLabel: selectedField.label, proposal };
                        return <FindingCard key={findingKey(entry.fieldId, proposal)} entry={entry} onAccept={() => acceptFinding(entry)} onIgnore={() => ignoreFinding(entry)} onOpen={() => openFindingInEditor(entry)} />;
                      })}
                      {selectedIgnored.length > 0 && <div className="finding-group ignored-group"><h2>Ignored <span>{selectedIgnored.length}</span></h2>{selectedIgnored.map((entry) => <FindingCard key={findingKey(entry.fieldId, entry.proposal)} entry={entry} ignored onRestore={() => restoreFinding(entry)} onOpen={() => openFindingInEditor(entry)} />)}</div>}
                      {proposals.length === 0 && selectedAccepted.length + selectedIgnored.length > 0 && <div className="clean-state"><span>✓</span><h2>All findings resolved</h2><p>Every finding in this field was accepted or ignored.</p></div>}
                      {proposals.length === 0 && selectedAccepted.length + selectedIgnored.length === 0 && fromPlatform === toPlatform && fieldFindings.length === 0 && <div className="clean-state"><span>↔</span><h2>No applicable macro conversion</h2><p>The source and target profiles match. Other checks found nothing in this field.</p></div>}
                      {proposals.length === 0 && selectedAccepted.length + selectedIgnored.length === 0 && fromPlatform !== toPlatform && fieldFindings.length === 0 && <div className="clean-state"><span>✓</span><h2>No findings</h2><p>No applicable conversion or formatting findings were detected in this field.</p></div>}
                    </div>
                  )}

                  {reviewAll && (
                    <div className="all-review">
                      <div className="all-review-heading">
                        <div><h2>Whole-card review</h2><p>Review findings by field, then jump to the exact source text when context is needed.</p></div>
                        <div className="review-totals"><span><strong>{allOpenFindings.length}</strong> open</span><span><strong>{unresolvedCount}</strong> unsupported macros</span><span><strong>{manualReviewCount}</strong> manual review</span><span><strong>{changedFields}</strong> modified</span></div>
                      </div>
                      <section className="bulk-actions" aria-label="Card-wide safe apply">
                        <div className="bulk-preview">
                          <strong>{allSafeFindings.length} safe change{allSafeFindings.length === 1 ? "" : "s"} ready</strong>
                          <span>{safeCategoryCounts.length > 0 ? safeCategoryCounts.map((item) => `${item.category}: ${item.count}`).join(" · ") : "Only non-overlapping, high-confidence replacements are included."}</span>
                        </div>
                        <div>
                          <button className="primary" disabled={allSafeFindings.length === 0} onClick={applySafeAcrossCard}>Apply safe changes across card</button>
                          {cardWideUndo && <button className="secondary" onClick={undoSafeAcrossCard}>Undo card-wide apply</button>}
                        </div>
                      </section>
                      <div className="all-review-fields">
                        {reviewFields.map((review) => (
                          <details className="review-field" key={review.field.id} open={expandedReviewFields.has(review.field.id)} onToggle={(event) => {
                            const fieldId = review.field.id;
                            const isOpen = event.currentTarget.open;
                            setExpandedReviewFields((ids) => {
                              const next = new Set(ids);
                              if (isOpen) next.add(fieldId);
                              else next.delete(fieldId);
                              return next;
                            });
                          }}>
                            <summary>
                              <span>{review.field.label}</span>
                              <span className="review-field-counts">{review.open.length > 0 && <b>{review.open.length} open</b>}{review.accepted.length > 0 && <em>{review.accepted.length} accepted</em>}{review.ignored.length > 0 && <em>{review.ignored.length} ignored</em>}{review.field.value !== review.field.originalValue && <i>Changed</i>}</span>
                            </summary>
                            <div className="review-field-body">
                              {Array.from(new Set(review.open.map((entry) => entry.proposal.category))).map((category) => {
                                const entries = review.open.filter((entry) => entry.proposal.category === category);
                                return <div className="finding-group" key={category}><h3>{category} <span>{entries.length}</span></h3>{entries.map((entry) => <FindingCard key={findingKey(entry.fieldId, entry.proposal)} entry={entry} onAccept={() => acceptFinding(entry)} onIgnore={() => ignoreFinding(entry)} onOpen={() => openFindingInEditor(entry)} />)}</div>;
                              })}
                              {review.ignored.length > 0 && <div className="finding-group ignored-group"><h3>Ignored <span>{review.ignored.length}</span></h3>{review.ignored.map((entry) => <FindingCard key={findingKey(entry.fieldId, entry.proposal)} entry={entry} ignored onRestore={() => restoreFinding(entry)} onOpen={() => openFindingInEditor(entry)} />)}</div>}
                              {review.open.length === 0 && review.ignored.length === 0 && <p className="resolved-field">No open findings. This field is included because it was modified.</p>}
                            </div>
                          </details>
                        ))}
                        {reviewFields.length === 0 && fromPlatform === toPlatform && <div className="clean-state"><span>↔</span><h2>No applicable macro conversion</h2><p>The source and target profiles match, and other checks found nothing in this card.</p></div>}
                        {reviewFields.length === 0 && fromPlatform !== toPlatform && <div className="clean-state"><span>✓</span><h2>No findings</h2><p>No applicable conversion or formatting findings were detected anywhere in this card.</p></div>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedField && tab === "preview" && (
                <>
                  <div className="preview-controls">
                    <label>Preview mode<select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as PreviewMode)}><option value="raw">Raw source</option><option value="janitor">Janitor user-visible</option><option value="sillytavern">SillyTavern user-visible</option></select></label>
                    <label>Resolve macros as<select value={previewPronouns} disabled={previewMode === "raw"} onChange={(event) => setPreviewPronouns(event.target.value as PreviewPronouns)}><option value="she">she / her</option><option value="he">he / him</option><option value="they">they / them</option></select></label>
                    {previewResult && previewMode !== "raw" && <span className="preview-stat">{previewResult.hiddenSegments} hidden segment{previewResult.hiddenSegments === 1 ? "" : "s"}</span>}
                  </div>
                  <div className="preview-columns">
                    <section><h2>Imported source</h2><div className="rendered source-view">{selectedField.originalValue}</div></section>
                    <section><h2>{previewMode === "raw" ? "Edited source" : previewMode === "janitor" ? "Janitor user-visible" : "SillyTavern user-visible"}</h2>{previewMode === "raw" ? <div className="rendered source-view">{previewResult?.text}</div> : <div className="rendered" dangerouslySetInnerHTML={{ __html: safeMarkup(previewResult?.text ?? "") }} />}</section>
                  </div>
                  <p className="preview-note">Platform views hide display-only source segments and substitute labels for macros without changing the card. Pronoun preview is not a grammatical rewrite. Unclosed hide markers remain visible for review.</p>
                </>
              )}

              {tab === "reference" && (
                <div className="reference-panel">
                  <div className="panel-heading"><div><span>Pronoun macro reference</span><small>Two supported syntax families</small></div></div>
                  <p className="reference-intro">SillyTavern uses the WyvernChat macro family through its Pronouns extension; it is not modeled as a third syntax. Copy a token without changing the card.</p>
                  <div className="reference-table-wrap">
                    <table className="reference-table">
                      <thead><tr><th scope="col">Grammar role</th><th scope="col">JanitorAI</th><th scope="col">Wyvern / ST extension</th></tr></thead>
                      <tbody>{macroReferenceRows.map((row) => <tr key={row.role}><th scope="row">{row.label}</th><td>{row.janitor ? <div className="macro-cell"><code>{row.janitor}</code><button className="secondary small" aria-label={`Copy JanitorAI ${row.label} macro`} onClick={() => void copyText(row.janitor!)}>Copy</button></div> : <span className="unsupported">No equivalent</span>}</td><td>{row.wyvern ? <div className="macro-cell"><code>{row.wyvern}</code><button className="secondary small" aria-label={`Copy Wyvern ${row.label} macro`} onClick={() => void copyText(row.wyvern!)}>Copy</button></div> : <span className="unsupported">No equivalent</span>}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <p className="preview-note">Unsupported roles are preserved exactly during conversion and appear in Review and the export ledger.</p>
                </div>
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
                    <section className="wide"><h2>Open review findings</h2>{changeSummary.reviewRequired.length > 0 ? <ul>{changeSummary.reviewRequired.map((entry) => <li key={findingKey(entry.fieldId, entry.proposal)}><span>{entry.fieldLabel}</span><code>{entry.proposal.before}</code><small>{entry.proposal.explanation}</small></li>)}</ul> : <p className="muted">No outstanding formatting, pronoun, gender, macro-conversion, structure, or punctuation findings remain.</p>}</section>
                    <section className="wide"><h2>Macros without target equivalents</h2>{changeSummary.unresolved.length > 0 ? <ul>{changeSummary.unresolved.map((entry) => <li key={findingKey(entry.fieldId, entry.proposal)}><span>{entry.fieldLabel}</span><code>{entry.proposal.before}</code><small>{entry.proposal.explanation}</small></li>)}</ul> : <p className="muted">Every recognized source macro has a target equivalent.</p>}</section>
                  </div>
                  <div className="summary-actions"><button className="primary" onClick={exportFile}>Download verified card</button><button className="secondary" onClick={() => exportLedger("md")}>Download Markdown ledger</button><button className="secondary" onClick={() => exportLedger("json")}>Download JSON ledger</button><span>The card is re-imported and compared before download. Ledgers capture the current review state.</span></div>
                </div>
              )}
            </section>
          </section>
        </>
      )}

      <footer className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("invalid") || message.toLowerCase().includes("blocked") ? "status error" : "status"} aria-live="polite">
        <span>{message}{downloadFallback && <> · <a href={downloadFallback.url} download={downloadFallback.fileName}>Download again</a></>}</span>
        {workspace && <span>Original retained in memory · {changedFields} field{changedFields === 1 ? "" : "s"} changed</span>}
      </footer>
    </main>
  );
}

export default App;

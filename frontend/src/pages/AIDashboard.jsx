import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { fetcher } from "@/lib/api";
import { PageHeader, Spinner } from "@/components/common/Bits";

function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatDuration(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value) >= 1000
    ? `${formatNumber(Number(value) / 1000, 2)} sec`
    : `${formatNumber(value, 2)} ms`;
}

function readable(value) {
  if (value == null || value === "") return "Not available";
  if (typeof value === "object" && "value" in value) return String(value.value ?? "Not available");
  if (Array.isArray(value)) return value.map(readable).join(", ");
  return String(value).replaceAll("_", " ");
}

function PredictionCard({ label, value }) {
  return <div className="rounded-xl border border-border/70 bg-background/40 p-3">
    <div className="eyebrow mb-1">{label}</div>
    <div className="text-sm capitalize">{readable(value)}</div>
  </div>;
}

function Metric({ label, value, detail }) {
  return <div className="rounded-xl border border-border/70 bg-background/40 px-3 py-2.5">
    <div className="eyebrow">{label}</div>
    <div className="mt-1 font-mono-ui text-lg">{value}</div>
    {detail && <div className="text-[11px] text-muted-foreground">{detail}</div>}
  </div>;
}

function JsonBlock({ value }) {
  return <pre className="max-h-96 overflow-auto rounded-xl bg-background p-4 font-mono-ui text-[11px] leading-relaxed text-muted-foreground">{JSON.stringify(value ?? {}, null, 2)}</pre>;
}

function SceneValue({ prediction }) {
  if (prediction == null) return "Not detected";
  if (typeof prediction === "object" && "value" in prediction) {
    const confidence = Number(prediction.confidence);
    return <>{readable(prediction)}{Number.isFinite(confidence) && <span className="ml-2 text-xs text-muted-foreground">{Math.round(confidence * 100)}% confidence</span>}</>;
  }
  return readable(prediction);
}

function StageImageDebugger({ stages = [] }) {
  const [stageIndex, setStageIndex] = useState(1);
  const [wipe, setWipe] = useState(50);
  if (!stages.length) return <p className="text-sm text-muted-foreground">Enable Visual Enhancement Debugger in Settings and reprocess this image to save stage checkpoints.</p>;
  const index = Math.min(stageIndex, Math.max(1, stages.length - 1));
  const before = stages[Math.max(0, index - 1)];
  const after = stages[index] || stages[0];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="text-sm">Checkpoint <select className="ml-2 rounded-lg border border-border bg-background p-2" value={index} onChange={(event) => setStageIndex(Number(event.target.value))}>{stages.slice(1).map((stage, i) => <option key={`${stage.stage}-${i}`} value={i + 1}>{stage.label || readable(stage.stage)}</option>)}</select></label>
      {after.url && <a className="text-xs text-gold underline" href={after.url} download={after.file}>Download {after.label || after.stage}</a>}
    </div>
    <div className="relative mx-auto aspect-[4/3] max-h-[560px] overflow-hidden rounded-xl border border-border bg-background">
      {before.url && <img src={before.url} alt={before.label || "Previous stage"} className="absolute inset-0 h-full w-full object-contain" />}
      {after.url && <img src={after.url} alt={after.label || "Selected stage"} className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }} />}
      <span className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs text-white">{before.label || before.stage}</span>
      <span className="absolute right-3 top-3 rounded bg-black/70 px-2 py-1 text-xs text-white">{after.label || after.stage}</span>
      <input aria-label="Image comparison wipe" className="absolute inset-x-3 bottom-3 z-10 w-[calc(100%-1.5rem)] accent-amber-400" type="range" min="0" max="100" value={wipe} onChange={(event) => setWipe(Number(event.target.value))} />
    </div>
    <div className="flex flex-wrap gap-2">{[before, after].map((stage, i) => stage.url && <a key={`${stage.file}-${i}`} className="rounded-full border border-border px-3 py-1 text-xs text-gold underline" href={stage.url} download={stage.file}>Download {stage.label || stage.stage}</a>)}</div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Stage runtime" value={formatDuration(after.runtime_ms)} />
      <Metric label="Quality improvement" value={after.improvement_from_previous == null ? "—" : `${after.improvement_from_previous > 0 ? "+" : ""}${formatNumber(after.improvement_from_previous)} pts`} />
      <Metric label="Strength applied" value={Object.entries(after.strength_applied || {}).map(([key, value]) => `${readable(key)} ${formatNumber(value, 3)}`).join(" · ") || "—"} />
      <Metric label="Mask coverage" value={after.mask_coverage_pct == null ? "—" : `${formatNumber(after.mask_coverage_pct, 2)}%`} detail={(after.mask_classes || []).join(", ")} />
    </div>
    {after.skip_reason && <p className="text-xs text-muted-foreground">Skipped: {readable(after.skip_reason)}</p>}
  </div>;
}

function parameterRows(stage) {
  const values = stage.strength_applied || {};
  const rows = Object.entries(values).filter(([, value]) => value != null && typeof value !== "object");
  if (stage.stage_result && typeof stage.stage_result === "object") {
    rows.push(...Object.entries(stage.stage_result).filter(([, value]) => value == null || typeof value !== "object"));
  }
  return rows;
}

function StageTimeline({ stages, checkpoints }) {
  if (!stages.length) return <p className="text-sm text-muted-foreground">No pipeline stages are recorded for this image.</p>;
  return <Accordion type="multiple" className="w-full">
    {stages.map((stage, index) => {
      const success = stage.status !== "failed";
      const checkpointIndex = checkpoints.findIndex((item) => item.stage === stage.stage);
      const previousImage = checkpointIndex > 0 ? checkpoints[checkpointIndex - 1] : checkpoints[0];
      const currentImage = checkpointIndex >= 0 ? checkpoints[checkpointIndex] : null;
      const parameters = parameterRows(stage);
      return <AccordionItem key={`${stage.stage}-${index}`} value={`${stage.stage}-${index}`} className="border-border/70">
        <AccordionTrigger className="gap-3 py-3 hover:no-underline">
          <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
            <span className="truncate font-medium capitalize">{readable(stage.label || stage.stage)}</span>
          </span>
          <span className="mr-2 shrink-0 font-mono-ui text-xs text-muted-foreground">{formatDuration(stage.timing?.duration_ms ?? stage.duration_ms ?? stage.execution_time_ms)}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pb-4 pl-7">
            {currentImage?.url && <div className="grid gap-3 sm:grid-cols-2">
              {[ ["Before", previousImage], ["After", currentImage] ].map(([label, image]) => <a key={label} href={image?.url} download={image?.file} className="overflow-hidden rounded-xl border border-border bg-background">
                <img src={image.url} alt={`${label} ${stage.stage}`} className="aspect-[4/3] max-h-64 w-full object-contain" loading="lazy" />
                <div className="border-t border-border px-3 py-2 text-xs">{label} · {image.label || image.stage} <span className="float-right text-gold">Download</span></div>
              </a>)}
            </div>}
            {!currentImage?.url && <p className="rounded-lg bg-background/60 p-3 text-xs text-muted-foreground">Stage images are not stored. Enable Visual Enhancement Debugger in Settings and reprocess to compare before and after images.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 p-3"><div className="eyebrow mb-2">Strength used</div>
                {parameters.length ? <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{parameters.map(([key, value]) => <div key={key}><dt className="text-[11px] capitalize text-muted-foreground">{readable(key)}</dt><dd className="font-mono-ui text-xs">{typeof value === "number" ? formatNumber(value, 4) : readable(value)}</dd></div>)}</dl> : <span className="text-xs text-muted-foreground">No tunable strength was recorded.</span>}
              </div>
              <div className="rounded-xl border border-border/70 p-3"><div className="eyebrow mb-2">Stage details</div>
                <dl className="space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{stage.executed === false ? "Skipped" : stage.status || "Complete"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Time</dt><dd className="font-mono-ui">{formatDuration(stage.timing?.duration_ms ?? stage.duration_ms ?? stage.execution_time_ms)}</dd></div>{stage.mean_pixel_difference != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Mean pixel difference</dt><dd className="font-mono-ui">{formatNumber(stage.mean_pixel_difference, 4)}</dd></div>}{stage.changed_pixel_pct != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Pixels changed</dt><dd className="font-mono-ui">{formatNumber(stage.changed_pixel_pct, 2)}%</dd></div>}{(stage.no_change_reason || stage.skip_reason) && <div><dt className="text-muted-foreground">Why little or no change</dt><dd className="mt-1">{readable(stage.no_change_reason || stage.skip_reason)}</dd></div>}</dl>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>;
    })}
  </Accordion>;
}

function PipelineDiagnostics({ report, checkpoints }) {
  if (!report.length) return <p className="text-sm text-muted-foreground">No execution report is recorded for this image.</p>;
  const checkpointByStage = new Map(checkpoints.map((checkpoint) => [checkpoint.stage, checkpoint]));
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Per-stage execution time, skip reason, and pixel-level visual change. Checkpoints are saved after each stage.</p>
    <div className="divide-y divide-border/70 rounded-xl border border-border/70 px-3">
      {report.map((stage, index) => {
        const checkpoint = checkpointByStage.get(stage.stage);
        const success = stage.status !== "failed";
        return <div key={`${stage.stage}-${index}`} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-start gap-2">
            {success && stage.executed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
            <div className="min-w-0">
              <div className="font-medium">{stage.stage_name || readable(stage.stage)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{stage.executed ? "Executed" : "Skipped"}{stage.changed_pixel_pct != null ? ` · ${formatNumber(stage.changed_pixel_pct, 3)}% pixels changed` : ""}{stage.mean_pixel_difference != null ? ` · mean difference ${formatNumber(stage.mean_pixel_difference, 4)}` : ""}</div>
              {!stage.meaningful_visual_effect && stage.executed && <div className="mt-1 text-xs text-amber-600">No meaningful visual effect (&lt; 0.5% of pixels changed).</div>}
              {!stage.executed && stage.skip_reason && <div className="mt-1 text-xs text-muted-foreground">Reason: {readable(stage.skip_reason)}</div>}
              {stage.status === "failed" && stage.skip_reason && <div className="mt-1 text-xs text-rose-400">{readable(stage.skip_reason)}</div>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pl-6 sm:justify-end sm:pl-0">
            <span className="font-mono-ui text-xs text-muted-foreground">{formatNumber(stage.duration_ms, 2)} ms</span>
            {checkpoint?.url && <a className="text-xs text-gold underline" href={checkpoint.url} download={`stage${String(index + 1).padStart(2, "0")}.jpg`}>stage{String(index + 1).padStart(2, "0")}.jpg</a>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function LearnedAdjustments() {
  const query = useQuery({
    queryKey: ["ai-dashboard-adaptive-presets"],
    queryFn: () => fetcher("/dashboard/ai/adaptive-presets"),
    refetchInterval: 30000,
  });
  const data = query.data || { presets: [] };
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Versioned, bounded multipliers learned from quality gains, approvals, and engagement. Built-in preset defaults remain unchanged.</p>
    {query.isLoading ? <Spinner /> : data.presets?.length ? <div className="grid gap-3 md:grid-cols-2">{data.presets.map((preset) => <div key={preset.key} className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2"><div className="font-medium capitalize">{preset.room_type} · {preset.preset}</div><span className="rounded-full border border-gold/50 px-2 py-1 font-mono-ui text-xs text-gold">v{preset.version}</span></div>
      <div className="mt-2 flex flex-wrap gap-2">{Object.entries(preset.weights || {}).map(([name, weight]) => <span key={name} className="rounded-full bg-background px-2 py-1 text-xs">{readable(name)} × {formatNumber(weight, 2)}</span>)}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">{preset.approved_quality_wins || 0} approved quality gains · {preset.sample_count || 0} samples</p>
    </div>)}</div> : <p className="text-sm text-muted-foreground">No learned adjustments yet. At least {data.minimum_samples || 3} approved quality gains are required before a weight changes.</p>}
  </div>;
}

function LearningRecord({ record, developerMode, onDeveloperModeChange }) {
  const predictions = record.scene_analysis?.predictions || {};
  const profile = record.adaptive_profile || {};
  const decision = profile.gpt_image_decision || {};
  const diagnostics = profile.stages || [];
  const stages = (record.stage_timings || []).map((timing) => {
    const diagnostic = diagnostics.find((item) => item.stage === timing.stage) || {};
    return { ...diagnostic, ...timing, timing };
  });
  const qualityBefore = record.quality?.before || record.quality_report || {};
  const qualityAfter = record.quality?.after || record.quality_after || {};
  const checkpoints = record.stage_images || [];
  const executionReport = record.execution_report?.length ? record.execution_report : stages.map((stage) => ({
    stage: stage.stage,
    stage_name: readable(stage.label || stage.stage),
    executed: stage.executed !== false,
    status: stage.status || "success",
    duration_ms: stage.timing?.duration_ms ?? stage.duration_ms ?? stage.execution_time_ms ?? 0,
    skip_reason: stage.skip_reason || (!stage.executed ? stage.no_change_reason : null),
    mean_pixel_difference: stage.mean_pixel_difference,
    changed_pixel_pct: stage.changed_pixel_pct,
    meaningful_visual_effect: stage.changed_pixel_pct == null || stage.changed_pixel_pct >= 0.5,
  }));
  const decisionScore = decision.inputs?.quality_score ?? qualityBefore.quality_score;
  const reason = decision.reasons?.length ? decision.reasons : decision.reason;
  const reasons = Array.isArray(reason) ? reason : reason ? [reason] : [];
  const gptStatus = record.gpt_status || profile.gpt_image_status;
  const gptUsed = gptStatus ? ["success", "completed"].includes(gptStatus) : decision.run_gpt === true || profile.gpt_prompt_used === true;
  const gptFinalLabel = gptStatus === "failed_fallback" ? "GPT Final · OpenCV fallback" : "GPT Final";

  return <article className="space-y-5" data-testid={`learning-record-${record.media_id}`}>
    <section className="panel p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Section 1 · Processing Summary</div><h2 className="mt-1 font-display text-xl">{record.media_id}</h2></div><span className="text-xs text-muted-foreground">{record.updated_at || record.created_at || ""}</span></div>
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {[["Original", record.before_image], ["OpenCV", record.opencv_image], [gptFinalLabel, record.after_image]].map(([label, image], index) => <div key={label} className="contents">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-background/40">
          {image?.url ? <a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`${label} for ${record.media_id}`} className="h-44 w-full object-contain sm:h-52" loading="lazy" /></a> : <div className="grid h-44 place-items-center text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>}
          <div className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">{label}</div>
          </div>
          {index < 2 && <div className="hidden text-xl text-gold md:block" aria-hidden="true">→</div>}
        </div>)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Metric label="Quality before" value={`${formatNumber(qualityBefore.quality_score)} / 100`} detail={qualityBefore.quality_grade || ""} />
        <Metric label="Quality after" value={`${formatNumber(qualityAfter.quality_score)} / 100`} detail={qualityAfter.quality_grade || ""} />
        <Metric label="Quality gain" value={record.quality_gain == null ? "—" : `${record.quality_gain > 0 ? "+" : ""}${formatNumber(record.quality_gain)} pts`} />
        <Metric label="Processing time" value={record.processing_time_seconds == null ? "—" : `${formatNumber(record.processing_time_seconds, 2)} sec`} />
        <Metric label="GPT Image" value={gptStatus === "failed_fallback" ? "Failed · OpenCV fallback" : gptStatus === "completed" ? "Completed ✓" : gptUsed ? "Used" : gptStatus === "not_run" ? "Not Run" : "Skipped"} detail={formatDuration(record.gpt_image_processing_time_ms)} />
      </div>
    </section>

    <section className="panel p-5 sm:p-6">
      <div className="eyebrow">Section 2 · AI Decision</div>
      <h2 className="mb-4 mt-1 font-display text-xl">What the system saw</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <PredictionCard label="Scene detected" value={record.scene_analysis?.scene || record.scene_analysis?.summary || predictions.room_type} />
        <PredictionCard label="Room type" value={predictions.room_type} />
        <PredictionCard label="Project stage" value={predictions.project_stage} />
        <PredictionCard label="Lighting" value={predictions.lighting_type} />
        <PredictionCard label="Interior style" value={predictions.interior_style} />
        <PredictionCard label="Preset selected" value={decision.inputs?.selected_preset || profile.preset} />
        <PredictionCard label="Quality score" value={decisionScore == null ? null : `${formatNumber(decisionScore)} / 100`} />
      </div>
      <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="eyebrow">Decision</div><div className="mt-1 font-display text-xl">{gptUsed ? "Run GPT Image" : gptStatus === "not_run" ? "Waiting for user request" : "Skip GPT Image · use OpenCV"}</div></div><span className={`rounded-full px-3 py-1 text-xs ${gptUsed ? "bg-gold/15 text-gold" : "bg-emerald-500/10 text-emerald-500"}`}>{gptUsed ? "GPT used" : gptStatus === "not_run" ? "GPT not run" : "GPT skipped"}</span></div>
        <div className="mt-3"><div className="eyebrow mb-1">Why</div>{reasons.length ? <ul className="space-y-1 text-sm leading-relaxed">{reasons.map((item, index) => <li key={`${index}-${item}`}>{readable(item)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No decision explanation was recorded.</p>}</div>
      </div>
    </section>

    <section className="panel p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><div className="eyebrow">Section 3 · Pipeline Inspector</div><h2 className="mt-1 font-display text-xl">Enhancement timeline</h2></div><span className="text-xs text-muted-foreground">Select a stage to inspect its images, strength, and runtime.</span></div>
      <StageTimeline stages={stages} checkpoints={checkpoints} />
    </section>

    <section className="panel p-5 sm:p-6">
      <Accordion type="single" collapsible>
        <AccordionItem value="pipeline-diagnostics" className="border-0">
          <AccordionTrigger className="py-1 hover:no-underline">
            <span className="text-left"><span className="font-display text-lg">Pipeline Diagnostics</span><span className="mt-1 block text-xs text-muted-foreground">Execution status, skipped-stage reasons, runtimes, and visual-change report</span></span>
          </AccordionTrigger>
          <AccordionContent className="pt-3"><PipelineDiagnostics report={executionReport} checkpoints={checkpoints} /></AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>

    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><div className="eyebrow">Section 4 · Developer Mode</div><h2 className="mt-1 font-display text-xl">Technical diagnostics</h2><p className="mt-1 text-xs text-muted-foreground">Raw analysis, masks, prompts, metadata, and checkpoint comparison.</p></div>
        <div className="flex items-center gap-3"><span className="text-sm">{developerMode ? "On" : "Off"}</span><Switch checked={developerMode} onCheckedChange={onDeveloperModeChange} aria-label="Enable Developer Mode" /></div>
      </div>
      {developerMode && <Accordion type="multiple" className="mt-4">
        <AccordionItem value="visual-checkpoints"><AccordionTrigger>Visual stage comparison</AccordionTrigger><AccordionContent><StageImageDebugger stages={checkpoints} /></AccordionContent></AccordionItem>
        <AccordionItem value="quality-metrics"><AccordionTrigger>OpenCV quality metrics</AccordionTrigger><AccordionContent><div className="grid gap-4 md:grid-cols-2"><div><div className="eyebrow mb-2">Before</div><JsonBlock value={qualityBefore.score_breakdown || {}} /></div><div><div className="eyebrow mb-2">After</div><JsonBlock value={qualityAfter.score_breakdown || {}} /></div></div></AccordionContent></AccordionItem>
        <AccordionItem value="quality-changes"><AccordionTrigger>Readable quality metric changes</AccordionTrigger><AccordionContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(qualityAfter.score_breakdown || {}).map(([name, detail]) => {
          const before = Number(qualityBefore.score_breakdown?.[name]?.score);
          const after = Number(detail.score);
          const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
          return <div key={name} className="rounded-lg border border-border p-3"><div className="flex justify-between gap-2 text-xs"><span className="capitalize">{readable(name)}</span><span className={delta > 0 ? "text-emerald-500" : "text-muted-foreground"}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta)} pts`}</span></div><div className="mt-1 font-mono-ui text-sm">{formatNumber(before)} → {formatNumber(after)} / 100</div></div>;
        })}</div></AccordionContent></AccordionItem>
        <AccordionItem value="analysis-json"><AccordionTrigger>Raw analysis JSON</AccordionTrigger><AccordionContent><JsonBlock value={record.scene_analysis} /></AccordionContent></AccordionItem>
        <AccordionItem value="profile-json"><AccordionTrigger>Adaptive profile JSON</AccordionTrigger><AccordionContent><JsonBlock value={profile} /></AccordionContent></AccordionItem>
        <AccordionItem value="masks"><AccordionTrigger>Masks and coverage</AccordionTrigger><AccordionContent><div className="grid gap-2 sm:grid-cols-2">{stages.filter((stage) => stage.mask_classes?.length || stage.mask_coverage_pct != null).map((stage, index) => <div key={`${stage.stage}-${index}`} className="rounded-xl border border-border p-3"><div className="text-sm capitalize">{readable(stage.stage)}</div><div className="mt-1 text-xs text-muted-foreground">{(stage.mask_classes || []).join(", ") || "Mask"} · {stage.mask_coverage_pct == null ? "Coverage unavailable" : `${formatNumber(stage.mask_coverage_pct, 2)}%`}</div></div>)}{!stages.some((stage) => stage.mask_classes?.length || stage.mask_coverage_pct != null) && <p className="text-sm text-muted-foreground">No masks were used for this image.</p>}</div></AccordionContent></AccordionItem>
        <AccordionItem value="prompt"><AccordionTrigger>GPT prompt</AccordionTrigger><AccordionContent><pre className="whitespace-pre-wrap rounded-xl bg-background p-4 text-sm leading-relaxed text-muted-foreground">{record.gpt_prompt || "No prompt was recorded."}</pre></AccordionContent></AccordionItem>
        <AccordionItem value="stage-metadata"><AccordionTrigger>Stage metadata and timings</AccordionTrigger><AccordionContent><JsonBlock value={{ stage_timings: record.stage_timings, stage_diagnostics: diagnostics, stage_images: checkpoints.map(({ file, url, ...metadata }) => metadata) }} /></AccordionContent></AccordionItem>
        <AccordionItem value="learned-adjustments"><AccordionTrigger>Learned preset adjustments</AccordionTrigger><AccordionContent><LearnedAdjustments /></AccordionContent></AccordionItem>
      </Accordion>}
    </section>
  </article>;
}

export default function AIDashboard() {
  const [skip, setSkip] = useState(0);
  const [developerMode, setDeveloperMode] = useState(false);
  const pageSize = 1;
  const recordsQuery = useQuery({
    queryKey: ["ai-dashboard-records", skip],
    queryFn: () => fetcher(`/dashboard/ai/records?limit=${pageSize}&skip=${skip}`),
    refetchInterval: 30000,
  });
  const records = recordsQuery.data || { items: [], total: 0 };
  const record = records.items[0];

  return <div>
    <PageHeader overline="Enhancement intelligence" title="AI Dashboard" subtitle="Inspect how each image was analyzed, enhanced, and decided." />
    {recordsQuery.isLoading && <div className="panel mb-5 flex items-center gap-3 p-5 text-sm text-muted-foreground"><Spinner /> Loading processed images…</div>}
    {recordsQuery.isError && <div className="panel mb-5 flex items-center gap-3 border-rose-500/40 p-5 text-sm text-rose-400"><AlertCircle className="h-4 w-4" />Could not load processed images. {recordsQuery.error?.message || "Refresh the page to retry."}</div>}
    {!recordsQuery.isLoading && !recordsQuery.isError && record && <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 text-gold" />Image inspection <span className="font-mono-ui text-xs">{skip + 1} of {records.total}</span></div>
        <div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Previous image" disabled={skip <= 0 || recordsQuery.isFetching} onClick={() => setSkip(Math.max(0, skip - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Next image" disabled={skip + 1 >= records.total || recordsQuery.isFetching} onClick={() => setSkip(skip + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
      </div>
      <LearningRecord record={record} developerMode={developerMode} onDeveloperModeChange={setDeveloperMode} />
    </>}
    {!recordsQuery.isLoading && !recordsQuery.isError && !record && <div className="panel p-10 text-center"><ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-display text-xl">No processed images yet</h2><p className="mt-2 text-sm text-muted-foreground">Process an image to inspect its decisions and enhancement stages here.</p></div>}
  </div>;
}

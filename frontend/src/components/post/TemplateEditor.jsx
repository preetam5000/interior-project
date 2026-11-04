import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ImagePlus, Layers3, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, can, errMsg, fetcher } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/common/Bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import InteractiveCanvas, { useInteractiveCanvas } from "@/template-engine/render/InteractiveCanvas";
import { adaptTemplateDocument, parseDesignTemplate } from "@/template-engine/templates/validateDesignTemplate";
import { applyCanvasCommand as applyDesignCommand } from "@/template-engine/render/utils/transforms";

const FIELD_LIMITS = { headline: 120, subtitle: 200, cta: 40 };
const FALLBACK_OPTIONS = {
  fonts: ["serif", "classic", "sans", "modern"],
  text_aligns: ["left", "center", "right"],
  cta_positions: ["stack", "top_right", "bottom_left", "bottom_center", "bottom_right"],
  logo_positions: ["top_left", "top_center", "top_right", "bottom_left", "bottom_center", "bottom_right"],
  button_styles: ["rounded", "square", "outline"],
};

function Field({ label, children }) {
  return <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function OptionSelect({ value, onValueChange, options, label }) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

export default function TemplateEditor({ media, open, onOpenChange, onApplied }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: library, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetcher("/templates"),
    enabled: open,
  });
  const [selection, setSelection] = useState("");
  const [name, setName] = useState("");
  const [config, setConfig] = useState(null);
  const [variant, setVariant] = useState("portrait");
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [interactivePreview, setInteractivePreview] = useState(useInteractiveCanvas);
  const [canvasTemplate, setCanvasTemplate] = useState(null);
  const [templateParseError, setTemplateParseError] = useState("");
  const [canvasSelection, setCanvasSelection] = useState(null);
  const canSave = can(user, "upload");
  const canExport = can(user, "approve");
  const options = library?.options || {};

  useEffect(() => {
    if (!error) return;
    toast.error(errMsg(error, "Could not load the template library."));
  }, [error]);

  useEffect(() => {
    if (!library || config) return;
    const first = library.presets?.[0];
    if (!first) return;
    setSelection(`preset:${first.key}`);
    setName(first.name);
    setConfig(first.config);
  }, [library, config]);

  useEffect(() => {
    if (!config) return;
    setTemplateParseError("");
    try {
      if (process.env.NODE_ENV !== "production") console.info("[TemplateEditor] Backend config", config);
      const adaptedTemplate = adaptTemplateDocument(config);
      if (process.env.NODE_ENV !== "production") console.info("[TemplateEditor] Legacy adapter result", adaptedTemplate);
      const validatedTemplate = parseDesignTemplate(adaptedTemplate);
      if (process.env.NODE_ENV !== "production") {
        console.info("[TemplateEditor] Validated DesignTemplate", validatedTemplate);
        console.info("[TemplateEditor] Number of elements", validatedTemplate.elements.length);
      }
      setCanvasTemplate(validatedTemplate);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[TemplateEditor] Template Parse Error", error);
      setCanvasTemplate(null);
      setTemplateParseError(reason);
    }
  }, [config]);

  useEffect(() => {
    if (!open || !interactivePreview || !canvasTemplate || templateParseError) return;
    if (process.env.NODE_ENV !== "production") {
      console.info("[TemplateEditor] Mounted renderer", {
        elementCount: canvasTemplate.elements.length,
        selectedMode: "Interactive",
      });
    }
  }, [open, interactivePreview, canvasTemplate, templateParseError]);

  const applyCanvasTransaction = (commands) => setCanvasTemplate((current) => current && ({
    ...current,
    elements: commands.reduce((elements, command) => applyDesignCommand(elements, command), current.elements),
  }));

  useEffect(() => {
    if (!open || !config || !media?.id) return undefined;
    let current = true;
    setPreview(null);
    setPreviewError("");
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.post("/templates/preview", {
          config,
          media_id: media.id,
          variant,
        });
        if (current) {
          setPreview(data);
          setPreviewError("");
        }
      } catch (e) {
        if (current) {
          setPreview(null);
          setPreviewError(errMsg(e, "Could not render the template preview."));
        }
      }
    }, 450);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [open, config, media?.id, variant]);

  const setField = (key, value) => setConfig((current) => ({ ...current, [key]: value }));

  const loadSelection = (value) => {
    setSelection(value);
    if (value.startsWith("preset:")) {
      const preset = library?.presets?.find((item) => item.key === value.slice(7));
      if (preset) {
        setName(preset.name);
        setConfig(preset.config);
      }
      return;
    }
    const template = library?.templates?.find((item) => item.id === value.slice(7));
    if (template) {
      setName(template.name);
      setConfig(template.config);
    }
  };

  const saveTemplate = async () => {
    if (!config) return;
    setBusy("save");
    try {
      const payload = { name, config };
      const { data } = selection.startsWith("saved:")
        ? await api.patch(`/templates/${selection.slice(6)}`, payload)
        : await api.post("/templates", payload);
      setSelection(`saved:${data.id}`);
      setName(data.name);
      setConfig(data.config);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(selection.startsWith("saved:") ? "Template updated" : "Template saved");
    } catch (e) {
      toast.error(errMsg(e, "Could not save the template."));
    } finally {
      setBusy("");
    }
  };

  const duplicateTemplate = async () => {
    if (!selection.startsWith("saved:")) return;
    setBusy("duplicate");
    try {
      const { data } = await api.post(`/templates/${selection.slice(6)}/duplicate`);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSelection(`saved:${data.id}`);
      setName(data.name);
      setConfig(data.config);
      toast.success("Template duplicated");
    } catch (e) {
      toast.error(errMsg(e, "Could not duplicate the template."));
    } finally {
      setBusy("");
    }
  };

  const deleteTemplate = async () => {
    if (!selection.startsWith("saved:")) return;
    setBusy("delete");
    try {
      await api.delete(`/templates/${selection.slice(6)}`);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      const first = library?.presets?.[0];
      if (first) {
        setSelection(`preset:${first.key}`);
        setName(first.name);
        setConfig(first.config);
      }
      toast.success("Template deleted");
    } catch (e) {
      toast.error(errMsg(e, "Could not delete the template."));
    } finally {
      setBusy("");
    }
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setLogoBusy(true);
    try {
      const { data } = await api.post("/templates/logo", form);
      setField("logo_url", data.url);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(errMsg(e, "Could not upload the logo."));
    } finally {
      setLogoBusy(false);
    }
  };

  const exportTemplate = async () => {
    if (!config || !media?.id) return;
    setBusy("export");
    try {
      const payload = { media_id: media.id, config };
      if (selection.startsWith("saved:")) payload.template_id = selection.slice(6);
      const { data } = await api.post("/templates/export", payload);
      await onApplied?.(data);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template applied to this image");
    } catch (e) {
      toast.error(errMsg(e, "Could not apply the template."));
    } finally {
      setBusy("");
    }
  };

  const revertTemplate = async () => {
    if (!media?.id) return;
    setBusy("revert");
    try {
      const { data } = await api.post("/templates/revert", { media_id: media.id });
      await onApplied?.(data);
      toast.success("Template removed");
    } catch (e) {
      toast.error(errMsg(e, "Could not remove the template."));
    } finally {
      setBusy("");
    }
  };

  const optionItems = (key) => (options[key] || FALLBACK_OPTIONS[key] || []).map((item) => (
    typeof item === "string" ? { value: item, label: item.replaceAll("_", " ") } : item
  ));
  const savedSelected = selection.startsWith("saved:");

  return (
    <>
      <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(true)} data-testid="open-template-editor-btn">
        <Sparkles className="mr-1 h-4 w-4 text-gold" />Template Editor
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="block max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader className="mb-5 pr-8">
            <DialogTitle className="font-display text-2xl">Template Editor</DialogTitle>
            <DialogDescription>Design and preview a branded template, then apply it to the selected image.</DialogDescription>
          </DialogHeader>
          {isLoading || !config ? <div className="flex justify-center py-12"><Spinner /></div> : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
              <section className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Template">
                    <Select value={selection} onValueChange={loadSelection}>
                      <SelectTrigger className="rounded-xl" data-testid="template-select"><SelectValue placeholder="Choose a template" /></SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Presets</div>
                        {(library?.presets || []).map((item) => <SelectItem key={`preset:${item.key}`} value={`preset:${item.key}`}>{item.name}</SelectItem>)}
                        {!!library?.templates?.length && <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Saved templates</div>}
                        {(library?.templates || []).map((item) => <SelectItem key={`saved:${item.id}`} value={`saved:${item.id}`}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Template name">
                    <Input value={name} maxLength={library?.limits?.name || 80} onChange={(e) => setName(e.target.value)} className="rounded-xl" data-testid="template-name-input" />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Template type">
                    <Select value={config.template_type} onValueChange={(value) => setField("template_type", value)}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{(library?.presets || []).map((item) => <SelectItem key={item.key} value={item.key}>{item.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <OptionSelect label="Headline font" value={config.font} onValueChange={(value) => setField("font", value)} options={optionItems("fonts")} />
                </div>

                <Field label="Headline">
                  <Input value={config.headline} maxLength={FIELD_LIMITS.headline} onChange={(e) => setField("headline", e.target.value)} className="rounded-xl" data-testid="template-headline-input" />
                </Field>
                <Field label="Subtitle">
                  <Textarea value={config.subtitle} maxLength={FIELD_LIMITS.subtitle} onChange={(e) => setField("subtitle", e.target.value)} rows={2} className="rounded-xl" data-testid="template-subtitle-input" />
                </Field>
                <Field label="Call to action">
                  <Input value={config.cta} maxLength={FIELD_LIMITS.cta} onChange={(e) => setField("cta", e.target.value)} className="rounded-xl" data-testid="template-cta-input" />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <OptionSelect label="Text alignment" value={config.text_align} onValueChange={(value) => setField("text_align", value)} options={optionItems("text_aligns")} />
                  <OptionSelect label="CTA position" value={config.cta_position} onValueChange={(value) => setField("cta_position", value)} options={optionItems("cta_positions")} />
                  <OptionSelect label="Logo position" value={config.logo_position} onValueChange={(value) => setField("logo_position", value)} options={optionItems("logo_positions")} />
                  <OptionSelect label="Button style" value={config.button_style || "rounded"} onValueChange={(value) => setField("button_style", value)} options={optionItems("button_styles")} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Primary brand color">
                    <Input value={config.primary_color || ""} placeholder="Use brand color" onChange={(e) => setField("primary_color", e.target.value)} className="rounded-xl" />
                  </Field>
                  <Field label="Secondary brand color">
                    <Input value={config.secondary_color || ""} placeholder="Use brand color" onChange={(e) => setField("secondary_color", e.target.value)} className="rounded-xl" />
                  </Field>
                </div>

                <Field label={`Overlay opacity · ${Math.round(Number(config.overlay_opacity) * 100)}%`}>
                  <Slider value={[Number(config.overlay_opacity)]} min={0} max={1} step={0.05} onValueChange={([value]) => setField("overlay_opacity", value)} />
                </Field>

                <Field label="Logo URL">
                  <div className="flex gap-2">
                    <Input value={config.logo_url || ""} maxLength={library?.limits?.logo_url || 500} onChange={(e) => setField("logo_url", e.target.value)} placeholder="https://…" className="rounded-xl" />
                    <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-input px-3 text-xs hover:bg-accent">
                      {logoBusy ? <Spinner /> : <ImagePlus className="h-4 w-4" />}Upload
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadLogo} disabled={!canSave || logoBusy} />
                    </label>
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
                  {[["show_badge", "Show badge"], ["show_logo", "Show logo"]].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-2 text-xs">
                      {label}<Switch checked={!!config[key]} onCheckedChange={(checked) => setField(key, checked)} />
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  {canSave && <Button onClick={saveTemplate} disabled={!!busy || !name.trim()} className="rounded-full" data-testid="save-template-btn">
                    {busy === "save" ? <Spinner /> : <><Save className="h-4 w-4" />{savedSelected ? "Save changes" : "Save template"}</>}
                  </Button>}
                  {canSave && savedSelected && <>
                    <Button variant="outline" onClick={duplicateTemplate} disabled={!!busy} className="rounded-full">
                      {busy === "duplicate" ? <Spinner /> : <><Copy className="h-4 w-4" />Duplicate</>}
                    </Button>
                    <Button variant="outline" onClick={deleteTemplate} disabled={!!busy} className="rounded-full text-rose-400">
                      {busy === "delete" ? <Spinner /> : <><Trash2 className="h-4 w-4" />Delete</>}
                    </Button>
                  </>}
                </div>
              </section>

              <aside className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="eyebrow">Live preview</div>
                  <div className="flex items-center gap-2">
                    <Button variant={interactivePreview ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setInteractivePreview(true)}>Interactive</Button>
                    <Button variant={!interactivePreview ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setInteractivePreview(false)}>Legacy</Button>
                    {!interactivePreview && <Select value={variant} onValueChange={setVariant}>
                      <SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="story">Story</SelectItem></SelectContent>
                    </Select>}
                  </div>
                </div>
                {templateParseError ? <div role="alert" data-testid="template-parse-error" className="grid min-h-80 place-content-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
                  <h3 className="font-semibold text-rose-400">Template Parse Error</h3>
                  <p className="max-w-lg text-sm text-muted-foreground">{templateParseError}</p>
                </div> : !canvasTemplate ? <div role="status" className="grid min-h-80 place-items-center rounded-2xl border border-border bg-muted/30 p-3"><Spinner /></div>
                  : interactivePreview ? <InteractiveCanvas template={canvasTemplate} context={{ imageSrc: media?.urls?.[variant] || media?.urls?.portrait, brand: { logo: config.logo_url } }} format={variant === "story" ? "story" : "portrait"} selectedId={canvasSelection} onSelectionChange={setCanvasSelection} onTransaction={applyCanvasTransaction} className="min-h-[520px]" />
                    : <div className="grid min-h-80 place-items-center overflow-hidden rounded-2xl border border-border bg-muted/30 p-3">
                      {preview ? <img src={preview.image} alt={name + " template preview"} className="max-h-[65vh] max-w-full rounded-lg object-contain" data-testid="template-preview-image" />
                        : previewError ? <p role="alert" className="max-w-sm text-center text-sm text-rose-400">{previewError}</p>
                          : <Spinner />}
                    </div>}
                {preview?.warning && <p role="status" className="text-xs text-amber-500">{preview.warning}</p>}
                <p className="text-xs text-muted-foreground">Preview uses the selected approval image. Changes apply to both portrait and story variants when exported.</p>
                <div className="flex flex-wrap gap-2">
                  {canExport && <Button onClick={exportTemplate} disabled={!!busy || !config} className="rounded-full" data-testid="apply-template-btn">
                    {busy === "export" ? <Spinner /> : <><Layers3 className="h-4 w-4" />Apply template</>}
                  </Button>}
                  {canExport && media?.template_export && <Button variant="outline" onClick={revertTemplate} disabled={!!busy} className="rounded-full">
                    {busy === "revert" ? <Spinner /> : <><RotateCcw className="h-4 w-4" />Revert template</>}
                  </Button>}
                </div>
                {!canExport && <p className="text-xs text-muted-foreground">You can edit and save templates, but approval permission is required to apply one.</p>}
              </aside>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

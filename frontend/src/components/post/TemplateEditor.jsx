import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlignLeft, ArrowDownToLine, ArrowLeft, Check, ChevronDown, Clock3, Command, Eye, FileImage, FolderOpen, Grid2X2, History, ImagePlus, Layers3, LayoutTemplate, Minus, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Palette, Pin, PinOff, Play, Plus, Redo2, RotateCcw, Save, Search, SlidersHorizontal, Sparkles, Store, Timer, Trash2, Undo2, Upload, WandSparkles, X } from "lucide-react";
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
import { useSelection } from "@/template-engine/editor/useSelection";
import { HistoryManager } from "@/template-engine/core/history";
import { useLayers } from "@/template-engine/editor/layers/useLayers";
import { useInspector } from "@/template-engine/editor/inspector/useInspector";
import { useEditorShortcuts } from "@/template-engine/editor/shortcuts";
import { mergeLegacyConfigWithDocument, toTemplateEditorConfig } from "@/template-engine/templates/templateEditorConfig";
import { PROFESSIONAL_STUDIO_TEMPLATES, getStudioTemplateVariant } from "@/template-engine/templates/professionalStudio";
import InspectorPanel from "@/template-engine/render/inspector/InspectorPanel";
import LayersPanel from "@/template-engine/render/layers/LayersPanel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import AssetLibraryPanel from "./assets/AssetLibraryPanel";
import { ASSET_CATALOG } from "./assets/assetCatalog";
import AnimationStudioPanel from "./AnimationStudioPanel";
import AnimationTimeline from "./AnimationTimeline";
import { createAnimationTimeline } from "@/template-engine/timeline";
import DesignAssistantPanel from "./DesignAssistantPanel";
import BrandKitManagerPanel from "./BrandKitManagerPanel";
import ExportStudioPanel from "./ExportStudioPanel";
import TemplateMarketplacePanel from "./TemplateMarketplacePanel";

const FIELD_LIMITS = { headline: 120, subtitle: 200, cta: 40 };
const DESIGN_ASSISTANT_TEMPLATES = PROFESSIONAL_STUDIO_TEMPLATES.map((item) => item.jsonDefinition);
const FALLBACK_OPTIONS = {
  fonts: ["serif", "classic", "sans", "modern"],
  text_aligns: ["left", "center", "right"],
  cta_positions: ["stack", "top_right", "bottom_left", "bottom_center", "bottom_right"],
  logo_positions: ["top_left", "top_center", "top_right", "bottom_left", "bottom_center", "bottom_right"],
  button_styles: ["rounded", "square", "outline"],
};
const TEMPLATE_FONT_FAMILIES = { serif: "Playfair Display", classic: "Cormorant Garamond", sans: "Inter", modern: "Montserrat" };

function applyStudioField(document, key, value) {
  const next = { ...document, branding: { ...document.branding, palette: { ...(document.branding?.palette || {}) } }, elements: document.elements.map((element) => ({ ...element })) };
  const first = (predicate) => next.elements.findIndex(predicate);
  const setText = (type, content) => {
    const index = first((element) => element.type === type);
    if (index >= 0) next.elements[index] = { ...next.elements[index], content };
  };
  if (key === "headline") setText("Heading", value);
  else if (key === "subtitle") setText("Body Text", value);
  else if (key === "cta") setText("CTA Button", value);
  else if (key === "primary_color") next.branding.palette = { ...next.branding.palette, primary: value, accent: value };
  else if (key === "secondary_color") next.branding.palette = { ...next.branding.palette, secondary: value };
  else if (key === "font") next.elements = next.elements.map((element) => ({ ...element, ...(["Heading", "Subtitle", "Body Text", "CTA Button", "Badge"].includes(element.type) ? { fontFamily: TEMPLATE_FONT_FAMILIES[value] || value } : {}) }));
  else if (key === "text_align") next.elements = next.elements.map((element) => ({ ...element, ...(["Heading", "Subtitle", "Body Text", "CTA Button", "Badge"].includes(element.type) ? { alignment: value } : {}) }));
  else if (key === "logo_url") {
    next.branding.logo = value || undefined;
    next.elements = next.elements.map((element) => element.type === "Logo" ? { ...element, source: value || "brand.logo" } : element);
  } else if (key === "show_logo" || key === "show_badge") {
    const type = key === "show_logo" ? "Logo" : "Badge";
    next.elements = next.elements.map((element) => element.type === type ? { ...element, visible: Boolean(value) } : element);
  } else if (key === "overlay_opacity") next.elements = next.elements.map((element) => element.type === "Gradient" ? { ...element, opacity: Math.max(0, Math.min(1, Number(value))) } : element);
  else if (key === "cta_position" || key === "logo_position") {
    const type = key === "cta_position" ? "CTA Button" : "Logo";
    const index = first((element) => element.type === type);
    if (index >= 0) {
      const element = next.elements[index];
      const x = value.endsWith("left") ? 0.075 : value.endsWith("right") ? 1 - 0.075 - element.width : (1 - element.width) / 2;
      const y = value.startsWith("top") ? 0.09 : value.startsWith("bottom") ? 1 - 0.11 - element.height : (1 - element.height) / 2;
      next.elements[index] = { ...element, x: Math.max(0, Math.min(1 - element.width, x)), y: Math.max(0, Math.min(1 - element.height, y)) };
    }
  }
  return next;
}

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

function RailButton({ active, label, hint, onClick, children }) {
  return <button type="button" title={`${label}${hint ? ` Â· ${hint}` : ""}`} aria-label={label} aria-pressed={active} onClick={onClick} className={`group flex w-full flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[9px] font-medium transition-all duration-200 ${active ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"}`}>
    <span className={`grid h-8 w-8 place-items-center rounded-xl transition-all ${active ? "bg-primary text-primary-foreground shadow-md" : "bg-background/55 group-hover:bg-background"}`}>{children}</span>
    <span>{label}</span>
  </button>;
}

function MiniMap({ template, selectedIds }) {
  if (!template) return null;
  return <div className="studio-minimap absolute bottom-4 right-4 z-20 hidden w-36 rounded-2xl border border-white/15 bg-slate-950/75 p-2.5 text-white shadow-2xl backdrop-blur-xl sm:block" aria-label="Canvas mini map">
    <div className="mb-2 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[.18em] text-white/60"><span>Mini map</span><Grid2X2 className="h-3 w-3" /></div>
    <div className="relative mx-auto aspect-[4/5] w-20 overflow-hidden rounded-md border border-white/25 bg-white/10 shadow-inner">
      {template.elements.filter((element) => element.visible).map((element) => <span key={element.id} className={`absolute rounded-[1px] ${selectedIds.includes(element.id) ? "bg-amber-300" : element.type === "Image" ? "bg-white/45" : "bg-sky-300/70"}`} style={{ left: `${element.x * 100}%`, top: `${element.y * 100}%`, width: `${Math.max(2, element.width * 100)}%`, height: `${Math.max(1, element.height * 100)}%` }} />)}
      <span className="pointer-events-none absolute inset-[18%] rounded border border-amber-300/80 bg-amber-200/5" />
    </div>
    <div className="mt-2 text-center font-mono-ui text-[9px] text-white/45">{template.elements.length} layers</div>
  </div>;
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
  const [leftPanel, setLeftPanel] = useState("templates");
  const [rightPanel, setRightPanel] = useState("properties");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftDocked, setLeftDocked] = useState(true);
  const [rightDocked, setRightDocked] = useState(true);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [animationTimeMs, setAnimationTimeMs] = useState(0);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const animationTimeRef = useRef(0);
  const skipNextConfigAdapt = useRef(false);
  const historyRef = useRef(null);
  if (!historyRef.current) historyRef.current = new HistoryManager();
  const { selectedIds: canvasSelection, select: updateCanvasSelection, restore: restoreCanvasSelection, addOrRemove: updateCanvasSelectionSet } = useSelection();
  const { tree: layerTree, removeLayer } = useLayers(canvasTemplate, canvasSelection);
  const { element: inspectedElement } = useInspector(canvasTemplate, canvasSelection);
  const canSave = can(user, "upload");
  const canExport = can(user, "approve");
  const options = library?.options || {};

  useEffect(() => {
    if (!animationPlaying || !open || !canvasTemplate) return undefined;
    const timeline = createAnimationTimeline(canvasTemplate);
    const duration = Math.max(1000, timeline.durationMs);
    const loops = timeline.tracks.some((track) => track.loop);
    let frame = 0;
    const started = performance.now() - animationTimeRef.current;
    const tick = (now) => {
      const elapsed = now - started;
      if (!loops && elapsed >= duration) {
        animationTimeRef.current = duration;
        setAnimationTimeMs(duration);
        setAnimationPlaying(false);
        return;
      }
      animationTimeRef.current = loops ? elapsed % duration : elapsed;
      setAnimationTimeMs(animationTimeRef.current);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [animationPlaying, open, canvasTemplate]);
  const setAnimationTime = (value) => { animationTimeRef.current = value; setAnimationTimeMs(value); };
  const setAnimationPlayback = (value) => { if (value) animationTimeRef.current = animationTimeMs; setAnimationPlaying(value); };

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
    if (skipNextConfigAdapt.current) {
      skipNextConfigAdapt.current = false;
      return;
    }
    setTemplateParseError("");
    try {
      if (process.env.NODE_ENV !== "production") {
        console.info("[TemplateEditor] Backend config", config);
      }
      const adaptedTemplate = adaptTemplateDocument(config);
      if (process.env.NODE_ENV !== "production") {
        console.info("[TemplateEditor] Legacy adapter result", adaptedTemplate);
      }
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

  const applyCanvasTransaction = (commands) => {
    if (!canvasTemplate || !commands.length) return;
    const result = historyRef.current.dispatch(canvasTemplate, commands, canvasSelection, { source: "canvas" });
    if (!result) return;
    const updatedDocument = result.document;
    restoreCanvasSelection(result.selection);
    skipNextConfigAdapt.current = true;
    setCanvasTemplate(updatedDocument);
    setConfig((current) => toTemplateEditorConfig(updatedDocument, current || {}));
  };
  const applyAnimationsToSelection = (ids, animation, settings = {}) => {
    if (!canvasTemplate || !ids.length) return;
    const groupId = settings.grouped ? `animation-group-${Date.now().toString(36)}` : undefined;
    const orderedIds = settings.cascade
      ? [...ids].sort((a, b) => (canvasTemplate.elements.find((element) => element.id === a)?.zIndex || 0) - (canvasTemplate.elements.find((element) => element.id === b)?.zIndex || 0))
      : ids;
    applyCanvasTransaction(orderedIds.map((id, index) => {
      const element = canvasTemplate.elements.find((item) => item.id === id);
      const next = { ...animation, delayMs: animation.delayMs + index * (settings.staggerMs || 0), ...(groupId ? { groupId } : {}) };
      return { type: "SetElementProperties", id, properties: { animations: [...(element?.animations || []), next] } };
    }));
  };
  const removeAnimationsFromSelection = (ids) => {
    if (!canvasTemplate || !ids.length) return;
    applyCanvasTransaction(ids.map((id) => ({ type: "SetElementProperties", id, properties: { animations: [] } })));
  };
  const selectTimelineLayer = (id) => updateCanvasSelection(id, (canvasTemplate?.elements || []).filter((element) => element.visible).sort((a, b) => a.zIndex - b.zIndex).map((element) => element.id));
  const animationPreviewContext = { imageSrc: media?.urls?.story || media?.urls?.portrait, brand: { logo: config?.logo_url } };
  const applyHistoryResult = (result) => {
    if (!result) return;
    restoreCanvasSelection(result.selection);
    skipNextConfigAdapt.current = true;
    setCanvasTemplate(result.document);
    setConfig((current) => toTemplateEditorConfig(result.document, current || {}));
  };
  const applyDesignSuggestion = (suggestion) => {
    if (!canvasTemplate || !suggestion?.commands?.length) return;
    const result = historyRef.current.dispatch(canvasTemplate, suggestion.commands, canvasSelection, { source: "ai-assistant", label: `Apply suggestion: ${suggestion.title}` });
    if (result) applyHistoryResult(result);
  };
  const loadTemplateConfig = (nextConfig) => {
    if (!canvasTemplate) {
      setConfig(nextConfig);
      return;
    }
    try {
      const nextDocument = parseDesignTemplate(adaptTemplateDocument(nextConfig));
      const result = historyRef.current.dispatch(canvasTemplate, [{ type: "ApplyTemplate", template: nextDocument }], canvasSelection, { source: "template-editor" });
      if (result) applyHistoryResult(result);
      else setConfig(nextConfig);
    } catch {
      setConfig(nextConfig);
    }
  };

  const selectCanvasElement = (id, modifiers) => {
    const order = [...(canvasTemplate?.elements || [])].filter((element) => element.visible).sort((a, b) => a.zIndex - b.zIndex).map((element) => element.id);
    updateCanvasSelection(id, order, modifiers);
  };
  const insertAsset = (asset, position = { x: 0.5, y: 0.5 }) => {
    if (!canvasTemplate || !asset?.element) return;
    const nextElement = {
      ...asset.element,
      id: `${asset.element.id}-${Date.now().toString(36)}`,
      x: Math.max(0, Math.min(1 - asset.element.width, position.x - asset.element.width / 2)),
      y: Math.max(0, Math.min(1 - asset.element.height, position.y - asset.element.height / 2)),
      zIndex: Math.max(-1, ...canvasTemplate.elements.map((element) => element.zIndex)) + 1,
    };
    applyCanvasTransaction([{ type: "DuplicateNode", element: nextElement }]);
    restoreCanvasSelection([nextElement.id]);
  };
  const dropAssetOnCanvas = (event) => {
    event.preventDefault();
    const assetId = event.dataTransfer.getData("application/x-interior-studio-asset") || event.dataTransfer.getData("text/plain");
    const asset = ASSET_CATALOG.find((item) => item.id === assetId);
    if (!asset || !canvasTemplate) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    insertAsset(asset, { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height });
  };
  const { handleInput: handleShortcutInput } = useEditorShortcuts({
    template: canvasTemplate,
    selectedIds: canvasSelection,
    dispatch: applyCanvasTransaction,
    replaceSelection: restoreCanvasSelection,
    undo: () => canvasTemplate && applyHistoryResult(historyRef.current.undo(canvasTemplate)),
    redo: () => canvasTemplate && applyHistoryResult(historyRef.current.redo(canvasTemplate)),
  });

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

  const setField = (key, value) => {
    const nextConfig = { ...(config || {}), [key]: value };
    if (!canvasTemplate) {
      setConfig(nextConfig);
      return;
    }
    if (selection.startsWith("studio:")) {
      const updatedDocument = applyStudioField(canvasTemplate, key, value);
      const result = historyRef.current.dispatch(canvasTemplate, [{ type: "ApplyTemplate", template: updatedDocument, preserveSelection: true }], canvasSelection, { source: "template-editor", label: `Update ${key}` });
      if (result) {
        restoreCanvasSelection(result.selection);
        skipNextConfigAdapt.current = true;
        setCanvasTemplate(result.document);
        setConfig((current) => ({ ...toTemplateEditorConfig(result.document, current || {}), [key]: value }));
      } else setConfig(nextConfig);
      return;
    }
    const legacyConfig = { ...nextConfig };
    delete legacyConfig.design_document;
    try {
      const adapted = parseDesignTemplate(adaptTemplateDocument(legacyConfig));
      const updatedDocument = mergeLegacyConfigWithDocument(adapted, canvasTemplate, nextConfig, key);
      const result = historyRef.current.dispatch(canvasTemplate, [{ type: "ApplyTemplate", template: updatedDocument, preserveSelection: true }], canvasSelection, { source: "template-editor", label: `Update ${key}` });
      if (result) {
        restoreCanvasSelection(result.selection);
        skipNextConfigAdapt.current = true;
        setCanvasTemplate(result.document);
        setConfig(toTemplateEditorConfig(result.document, nextConfig));
      } else {
        setConfig(nextConfig);
      }
    } catch {
      setConfig(nextConfig);
    }
  };

  const loadSelection = (value) => {
    setSelection(value);
    updateCanvasSelection(null, []);
    if (value.startsWith("preset:")) {
      const preset = library?.presets?.find((item) => item.key === value.slice(7));
      if (preset) {
        setName(preset.name);
        loadTemplateConfig(preset.config);
      }
      return;
    }
    if (value.startsWith("studio:")) {
      const studio = PROFESSIONAL_STUDIO_TEMPLATES.find((item) => item.id === value.slice(7));
      if (studio) {
        setName(studio.name);
        const baseConfig = library?.presets?.[0]?.config || {};
        const definition = getStudioTemplateVariant(studio.id, variant)?.jsonDefinition || studio.jsonDefinition;
        const headline = definition.elements.find((element) => element.type === "Heading")?.content || studio.name;
        const subtitle = definition.elements.find((element) => element.type === "Body Text")?.content || studio.metadata.description;
        const cta = definition.elements.find((element) => element.type === "CTA Button")?.content || "Discover the project";
        loadTemplateConfig({ ...baseConfig, headline, subtitle, cta, design_document: definition });
      }
      return;
    }
    const template = library?.templates?.find((item) => item.id === value.slice(7));
    if (template) {
      setName(template.name);
      loadTemplateConfig(template.config);
    }
  };

  const useMarketplaceTemplate = (item) => {
    const definition = item.document;
    if (!definition) return;
    setSelection(`marketplace:${item.id}`);
    updateCanvasSelection(null, []);
    setName(item.name);
    const baseConfig = library?.presets?.[0]?.config || {};
    const headline = definition.elements.find((element) => element.type === "Heading")?.content || item.name;
    const subtitle = definition.elements.find((element) => element.type === "Body Text")?.content || definition.description || "";
    const cta = definition.elements.find((element) => element.type === "CTA Button")?.content || "Discover the project";
    loadTemplateConfig({ ...baseConfig, headline, subtitle, cta, design_document: definition });
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
  const studioSelected = selection.startsWith("studio:");
  const undo = () => canvasTemplate && applyHistoryResult(historyRef.current.undo(canvasTemplate));
  const redo = () => canvasTemplate && applyHistoryResult(historyRef.current.redo(canvasTemplate));
  const inspectorCanvas = canvasTemplate ? { width: canvasTemplate.canvas.width, height: canvasTemplate.canvas.height } : { width: 1080, height: 1350 };
  const panelIconClass = "h-4 w-4";
  const leftSidebar = <div className={`studio-side flex h-full min-h-0 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card/75 shadow-xl backdrop-blur-2xl ${leftCollapsed ? "w-[68px]" : "w-[340px]"}`}>
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-border/70 bg-background/45 px-2 py-3">
      <button type="button" title={leftCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setLeftCollapsed((value) => !value)} className="mb-2 grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground">{leftCollapsed ? <PanelLeftOpen className={panelIconClass} /> : <PanelLeftClose className={panelIconClass} />}</button>
      {!leftCollapsed && <>
        <RailButton active={leftPanel === "templates"} label="Templates" hint="T" onClick={() => setLeftPanel("templates")}><LayoutTemplate className={panelIconClass} /></RailButton>
        <RailButton active={leftPanel === "marketplace"} label="Marketplace" onClick={() => setLeftPanel("marketplace")}><Store className={panelIconClass} /></RailButton>
        <RailButton active={leftPanel === "assets"} label="Assets" onClick={() => setLeftPanel("assets")}><FolderOpen className={panelIconClass} /></RailButton>
        <RailButton active={leftPanel === "uploads"} label="Uploads" onClick={() => setLeftPanel("uploads")}><Upload className={panelIconClass} /></RailButton>
        <RailButton active={leftPanel === "brand"} label="Brand Kit" onClick={() => setLeftPanel("brand")}><Palette className={panelIconClass} /></RailButton>
        {canExport && <RailButton active={leftPanel === "export"} label="Export" onClick={() => setLeftPanel("export")}><ArrowDownToLine className={panelIconClass} /></RailButton>}
        <RailButton active={leftPanel === "animations"} label="Motion" onClick={() => setLeftPanel("animations")}><Timer className={panelIconClass} /></RailButton>
      </>}
      <div className="mt-auto grid h-9 w-9 place-items-center rounded-xl border border-border/70 bg-background/50 text-muted-foreground" title="Shortcuts: Space to pan Â· Shift-click to multi-select"><Command className="h-3.5 w-3.5" /></div>
    </nav>
    {!leftCollapsed && <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-12 items-center justify-between border-b border-border/70 px-4">
        <div className="min-w-0"><div className="text-[11px] font-semibold tracking-wide">{({ templates: "Templates", marketplace: "Marketplace", assets: "Assets", uploads: "Uploads", brand: "Brand kit", export: "Export studio", animations: "Animations" })[leftPanel]}</div><div className="text-[9px] text-muted-foreground">Studio workspace</div></div>
        <div className="flex items-center gap-1"><button type="button" title={leftDocked ? "Float panel" : "Dock panel"} onClick={() => setLeftDocked((value) => !value)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent"><Pin className={`h-3.5 w-3.5 ${leftDocked ? "" : "rotate-45 text-primary"}`} /></button><button type="button" title="More panel actions" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent"><MoreHorizontal className="h-4 w-4" /></button></div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3.5">
        {leftPanel === "templates" && <div className="space-y-4">
          <Field label="Choose a template">
            <Select value={selection} onValueChange={loadSelection}>
              <SelectTrigger className="h-10 rounded-xl border-border/70 bg-background/65" data-testid="template-select"><SelectValue placeholder="Choose a template" /></SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Presets</div>
                {(library?.presets || []).map((item) => <SelectItem key={`preset:${item.key}`} value={`preset:${item.key}`}>{item.name}</SelectItem>)}
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Professional Studio Â· {PROFESSIONAL_STUDIO_TEMPLATES.length}</div>
                {PROFESSIONAL_STUDIO_TEMPLATES.map((item) => <SelectItem key={`studio:${item.id}`} value={`studio:${item.id}`}>{item.category} Â· {item.name}</SelectItem>)}
                {!!library?.templates?.length && <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Saved templates</div>}
                {(library?.templates || []).map((item) => <SelectItem key={`saved:${item.id}`} value={`saved:${item.id}`}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {studioSelected && (() => { const item = PROFESSIONAL_STUDIO_TEMPLATES.find((template) => template.id === selection.slice(7)); return item && <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/45 shadow-sm">
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.preview.library)}`} alt={`${item.name} preview`} className="aspect-[4/5] w-full object-cover" />
            <div className="space-y-2 p-3.5"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold">{item.name}</div><div className="mt-1 text-[10px] text-muted-foreground">{item.category} Â· {item.aspectRatio}</div></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold text-primary">{item.qualityScore} quality</span></div><div className="flex flex-wrap gap-1">{item.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full border border-border/70 px-2 py-0.5 text-[9px] text-muted-foreground">{tag}</span>)}</div></div>
          </div>; })()}
          <div className="grid grid-cols-2 gap-2">{PROFESSIONAL_STUDIO_TEMPLATES.slice(0, 6).map((item) => <button key={item.id} type="button" onClick={() => loadSelection(`studio:${item.id}`)} className={`group overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg ${selection === `studio:${item.id}` ? "border-primary ring-2 ring-primary/15" : "border-border/70"}`}><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.preview.library)}`} alt="" className="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /><span className="block truncate px-2 py-1.5 text-[9px] font-medium">{item.category}</span></button>)}</div>
          <div className="rounded-xl border border-dashed border-border/80 p-3 text-[10px] leading-relaxed text-muted-foreground"><WandSparkles className="mb-2 h-4 w-4 text-primary" />100 Studio templates Â· 31 categories Â· adaptive formats</div>
        </div>}
        {leftPanel === "marketplace" && <TemplateMarketplacePanel catalog={PROFESSIONAL_STUDIO_TEMPLATES} onUse={useMarketplaceTemplate} />}
        {leftPanel === "assets" && <AssetLibraryPanel onInsert={(asset) => insertAsset(asset)} />}
        {leftPanel === "uploads" && <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-primary/35 bg-primary/[.035] p-5 text-center"><div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Upload className="h-5 w-5" /></div><div className="text-xs font-semibold">Upload brand logo</div><p className="mt-1 text-[10px] text-muted-foreground">PNG, JPEG, or WEBP Â· transparent PNG recommended</p><label className="mt-4 inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-[10px] font-semibold text-primary-foreground transition hover:opacity-90">{logoBusy ? <Spinner /> : <ImagePlus className="h-3.5 w-3.5" />}Choose file<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadLogo} disabled={!canSave || logoBusy} /></label></div>
          <Field label="Logo asset URL"><Input value={config.logo_url || ""} maxLength={library?.limits?.logo_url || 500} onChange={(event) => setField("logo_url", event.target.value)} placeholder="https://â€¦" className="rounded-xl bg-background/60" /></Field>
          <div className="rounded-xl border border-border/70 p-3 text-[10px] text-muted-foreground"><Check className="mr-1 inline h-3 w-3 text-emerald-500" />Uploaded logo is applied to the current template.</div>
        </div>}
        {leftPanel === "legacy-brand" && <div className="space-y-3.5">
          <div className="grid grid-cols-5 gap-1.5">{[config.primary_color, config.secondary_color, canvasTemplate?.branding?.palette?.accent, canvasTemplate?.branding?.palette?.surface, canvasTemplate?.branding?.palette?.text].filter(Boolean).map((color, index) => <span key={`${color}-${index}`} title={color} className="h-8 rounded-lg border border-border/70 shadow-inner" style={{ background: color }} />)}</div>
          <Field label="Template family"><Select value={config.template_type} onValueChange={(value) => setField("template_type", value)}><SelectTrigger className="rounded-xl bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{(library?.presets || []).map((item) => <SelectItem key={item.key} value={item.key}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
          <OptionSelect label="Headline font" value={config.font} onValueChange={(value) => setField("font", value)} options={optionItems("fonts")} />
          <Field label="Headline"><Input value={config.headline} maxLength={FIELD_LIMITS.headline} onChange={(event) => setField("headline", event.target.value)} className="rounded-xl bg-background/60" /></Field>
          <Field label="Supporting copy"><Textarea value={config.subtitle} maxLength={FIELD_LIMITS.subtitle} onChange={(event) => setField("subtitle", event.target.value)} rows={3} className="resize-none rounded-xl bg-background/60" /></Field>
          <Field label="Call to action"><Input value={config.cta} maxLength={FIELD_LIMITS.cta} onChange={(event) => setField("cta", event.target.value)} className="rounded-xl bg-background/60" /></Field>
          <div className="grid grid-cols-2 gap-2"><OptionSelect label="Alignment" value={config.text_align} onValueChange={(value) => setField("text_align", value)} options={optionItems("text_aligns")} /><OptionSelect label="Button style" value={config.button_style || "rounded"} onValueChange={(value) => setField("button_style", value)} options={optionItems("button_styles")} /><OptionSelect label="CTA position" value={config.cta_position} onValueChange={(value) => setField("cta_position", value)} options={optionItems("cta_positions")} /><OptionSelect label="Logo position" value={config.logo_position} onValueChange={(value) => setField("logo_position", value)} options={optionItems("logo_positions")} /></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Primary color"><Input value={config.primary_color || ""} onChange={(event) => setField("primary_color", event.target.value)} className="rounded-xl bg-background/60" /></Field><Field label="Secondary color"><Input value={config.secondary_color || ""} onChange={(event) => setField("secondary_color", event.target.value)} className="rounded-xl bg-background/60" /></Field></div>
          <Field label={`Overlay strength Â· ${Math.round(Number(config.overlay_opacity) * 100)}%`}><Slider value={[Number(config.overlay_opacity)]} min={0} max={1} step={0.05} onValueChange={([value]) => setField("overlay_opacity", value)} /></Field>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-background/35 p-3">{[["show_badge", "Badge"], ["show_logo", "Logo"]].map(([key, label]) => <label key={key} className="flex items-center justify-between gap-2 text-[10px]">{label}<Switch checked={!!config[key]} onCheckedChange={(checked) => setField(key, checked)} /></label>)}</div>
        </div>}
        {leftPanel === "brand" && <BrandKitManagerPanel />}
        {leftPanel === "export" && <ExportStudioPanel document={canvasTemplate} context={{ imageSrc: media?.urls?.[variant] || media?.urls?.portrait, brand: { logo: config.logo_url } }} />}
        {leftPanel === "animations" && <AnimationStudioPanel template={canvasTemplate} selectedIds={canvasSelection} onSelect={selectTimelineLayer} onApply={applyAnimationsToSelection} onRemove={removeAnimationsFromSelection} timeMs={animationTimeMs} context={animationPreviewContext} />}
      </div>
    </div>}
  </div>;
  const rightSidebar = <div className={`studio-side flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/75 shadow-xl backdrop-blur-2xl ${rightCollapsed ? "w-[56px]" : "w-[330px]"}`}>
    <div className="flex h-12 items-center justify-between border-b border-border/70 px-3"><div className="flex items-center gap-2 text-[11px] font-semibold"><SlidersHorizontal className="h-4 w-4 text-primary" />{rightCollapsed ? "" : ({ properties: "Inspector", layers: "Layers", animations: "Animations", history: "History", assistant: "Design assistant" })[rightPanel]}</div><div className="flex items-center gap-1"><button type="button" title={rightDocked ? "Float panel" : "Dock panel"} onClick={() => setRightDocked((value) => !value)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent"><Pin className={`h-3.5 w-3.5 ${rightDocked ? "" : "rotate-45 text-primary"}`} /></button><button type="button" title="Collapse inspector" onClick={() => setRightCollapsed((value) => !value)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent">{rightCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}</button></div></div>
    {!rightCollapsed && <>
      <div className="grid grid-cols-5 gap-1 border-b border-border/70 px-2 py-2">{[["properties", "Props", SlidersHorizontal], ["layers", "Layers", Layers3], ["animations", "Motion", Timer], ["assistant", "AI", WandSparkles], ["history", "History", History]].map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setRightPanel(id)} className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[8px] transition ${rightPanel === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
        {rightPanel === "properties" && <div className="studio-inspector [&>aside]:!static [&>aside]:!max-h-none [&>aside]:!w-full [&>aside]:!border-0 [&>aside]:!bg-transparent [&>aside]:!p-0 [&>aside]:!shadow-none"><InspectorPanel element={inspectedElement} elements={canvasTemplate?.elements || []} canvas={inspectorCanvas} onCommands={applyCanvasTransaction} /></div>}
        {rightPanel === "layers" && <div className="studio-layers [&>section]:!static [&>section]:!w-full [&>section]:!border-0 [&>section]:!bg-transparent [&>section]:!shadow-none"><LayersPanel tree={layerTree} elements={canvasTemplate?.elements || []} selectedIds={canvasSelection} onSelect={updateCanvasSelection} onCommands={applyCanvasTransaction} onRename={(id, layerName) => applyCanvasTransaction([{ type: "RenameLayer", id, name: layerName }])} onRemove={removeLayer} /></div>}
        {rightPanel === "animations" && <AnimationStudioPanel template={canvasTemplate} selectedIds={canvasSelection} onSelect={selectTimelineLayer} onApply={applyAnimationsToSelection} onRemove={removeAnimationsFromSelection} timeMs={animationTimeMs} context={animationPreviewContext} />}
        {rightPanel === "assistant" && <DesignAssistantPanel template={canvasTemplate} selectedIds={canvasSelection} templateCandidates={DESIGN_ASSISTANT_TEMPLATES} onApply={applyDesignSuggestion} />}
        {rightPanel === "history" && <div className="space-y-2"><div className="rounded-xl border border-border/70 bg-background/45 p-3"><div className="text-xs font-semibold">Document history</div><p className="mt-1 text-[10px] text-muted-foreground">Undo and redo editor changes.</p></div><button type="button" onClick={undo} disabled={!historyRef.current.canUndo} className="flex w-full items-center justify-between rounded-xl border border-border/70 p-3 text-xs transition hover:bg-accent disabled:opacity-40"><span className="flex items-center gap-2"><Undo2 className="h-4 w-4" />Undo</span><kbd className="rounded bg-muted px-1.5 py-0.5 text-[9px]">âŒ˜ Z</kbd></button><button type="button" onClick={redo} disabled={!historyRef.current.canRedo} className="flex w-full items-center justify-between rounded-xl border border-border/70 p-3 text-xs transition hover:bg-accent disabled:opacity-40"><span className="flex items-center gap-2"><Redo2 className="h-4 w-4" />Redo</span><kbd className="rounded bg-muted px-1.5 py-0.5 text-[9px]">âŒ˜ â‡§ Z</kbd></button></div>}
      </div>
    </>}
  </div>;

  return (
    <>
      <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(true)} data-testid="open-template-editor-btn">
        <Sparkles className="mr-1 h-4 w-4 text-gold" />Template Editor
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-[96vh] w-[98vw] max-h-[96vh] max-w-[1800px] overflow-hidden rounded-[26px] border-border/70 bg-background/85 p-0 shadow-2xl backdrop-blur-2xl">
          <DialogHeader className="sr-only"><DialogTitle>Template Editor</DialogTitle><DialogDescription>Design, preview, and apply a branded template.</DialogDescription></DialogHeader>
          {isLoading || !config ? <div className="grid h-full place-items-center"><Spinner /></div> : <div className="flex h-full min-h-0 flex-col">
            <header className="z-10 flex min-h-[62px] shrink-0 items-center gap-3 border-b border-border/70 bg-card/65 px-4 backdrop-blur-xl sm:px-5">
              <div className="flex min-w-0 items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span><div className="hidden min-w-0 sm:block"><div className="text-xs font-semibold">Interior Studio</div><div className="text-[9px] text-muted-foreground">Template editor</div></div></div>
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div className="flex min-w-0 flex-1 items-center gap-2"><Input value={name} maxLength={library?.limits?.name || 80} onChange={(event) => setName(event.target.value)} aria-label="Template name" className="h-9 max-w-[260px] rounded-xl border-transparent bg-transparent text-sm font-medium shadow-none hover:border-border focus-visible:border-primary" data-testid="template-name-input" /><span className="hidden rounded-md border border-border/70 px-1.5 py-1 text-[9px] text-muted-foreground md:inline">Template</span></div>
              <div className="flex items-center gap-1"><button type="button" title="Undo (Ctrl/? Z)" onClick={undo} disabled={!historyRef.current.canUndo} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent disabled:opacity-35"><Undo2 className="h-4 w-4" /></button><button type="button" title="Redo (Ctrl/? Shift Z)" onClick={redo} disabled={!historyRef.current.canRedo} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent disabled:opacity-35"><Redo2 className="h-4 w-4" /></button></div>
              {canSave && <Button onClick={saveTemplate} disabled={!!busy || !name.trim()} size="sm" className="h-9 rounded-xl px-3" data-testid="save-template-btn">{busy === "save" ? <Spinner /> : <><Save className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">{savedSelected ? "Save changes" : "Save"}</span></>}</Button>}
              {canExport && <Button onClick={exportTemplate} disabled={!!busy || !config} size="sm" variant="outline" className="h-9 rounded-xl px-3" data-testid="apply-template-btn">{busy === "export" ? <Spinner /> : <><ArrowDownToLine className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Apply</span></>}</Button>}
              <button type="button" title="Close editor" onClick={() => onOpenChange(false)} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
            </header>
            <div className="relative min-h-0 flex-1 p-2 sm:p-3">
              <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 gap-2">
                {leftDocked && <><ResizablePanel defaultSize={24} minSize={16} maxSize={34} className="hidden min-w-0 md:block">{leftSidebar}</ResizablePanel><ResizableHandle withHandle className="hidden w-1 rounded-full bg-border/50 transition hover:bg-primary/50 md:flex" /></>}
                <ResizablePanel defaultSize={leftDocked && rightDocked ? 52 : 76} minSize={30} className="min-w-0">
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <div className="flex h-11 shrink-0 items-center justify-between rounded-2xl border border-border/70 bg-card/65 px-3 shadow-sm backdrop-blur-xl"><div className="flex items-center gap-2"><span className="text-[10px] font-semibold">Canvas</span><span className="rounded-md bg-muted px-1.5 py-1 text-[9px] text-muted-foreground">{variant === "story" ? "Story" : "Portrait"}</span></div><div className="flex items-center gap-1"><Button variant={interactivePreview ? "secondary" : "ghost"} size="sm" className="h-7 rounded-lg px-2 text-[10px]" onClick={() => setInteractivePreview(true)}>Interactive</Button><Button variant={!interactivePreview ? "secondary" : "ghost"} size="sm" className="h-7 rounded-lg px-2 text-[10px]" onClick={() => setInteractivePreview(false)}>Preview</Button>{!interactivePreview && <Select value={variant} onValueChange={setVariant}><SelectTrigger className="ml-1 h-7 w-28 rounded-lg text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="story">Story</SelectItem></SelectContent></Select>}</div></div>
                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-muted/35 p-2 shadow-inner sm:p-3"><div className="absolute inset-0 opacity-[.22]" style={{ backgroundImage: "radial-gradient(hsl(var(--muted-foreground) / .35) .7px, transparent .7px)", backgroundSize: "18px 18px" }} />
                      <div className="relative z-[1] h-full min-h-0" onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-interior-studio-asset")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={dropAssetOnCanvas}>{templateParseError ? <div role="alert" data-testid="template-parse-error" className="grid h-full place-content-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center"><h3 className="font-semibold text-rose-400">Template Parse Error</h3><p className="max-w-lg text-sm text-muted-foreground">{templateParseError}</p></div> : !canvasTemplate ? <div role="status" className="grid h-full place-items-center"><Spinner /></div> : interactivePreview ? <InteractiveCanvas template={canvasTemplate} context={{ imageSrc: media?.urls?.[variant] || media?.urls?.portrait, brand: { logo: config.logo_url } }} format={variant === "story" ? "story" : "portrait"} selectedIds={canvasSelection} onSelectionChange={selectCanvasElement} onSelectionReplace={(ids, additive) => updateCanvasSelectionSet(ids, Boolean(additive))} onTransaction={applyCanvasTransaction} layers={layerTree} onLayerRename={(id, layerName) => applyCanvasTransaction([{ type: "RenameLayer", id, name: layerName }])} onLayerRemoved={removeLayer} inspectedElement={inspectedElement} onKeyboardInput={handleShortcutInput} className="h-full min-h-[360px]" /> : <div className="grid h-full place-items-center">{preview ? <img src={preview.image} alt={`${name} template preview`} className="max-h-full max-w-full rounded-xl object-contain shadow-xl" data-testid="template-preview-image" /> : previewError ? <p role="alert" className="max-w-sm text-center text-sm text-rose-400">{previewError}</p> : <Spinner />}</div>}</div>
                      <div className="absolute bottom-3 left-3 z-[2] hidden items-center gap-1 rounded-xl border border-border/70 bg-background/75 p-1.5 text-[9px] text-muted-foreground shadow-lg backdrop-blur-xl lg:flex"><span className="px-1.5">{canvasTemplate?.elements?.length || 0} layers</span><span className="h-3 w-px bg-border" /><span className="px-1.5">Shift click to multi-select</span></div><MiniMap template={canvasTemplate} selectedIds={canvasSelection} />
                    </div>
                    {preview?.warning && <p role="status" className="shrink-0 px-2 text-[10px] text-amber-500">{preview.warning}</p>}
                    <div className={`shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-card/65 shadow-sm backdrop-blur-xl transition-all ${timelineCollapsed ? "h-10" : "h-[132px]"}`}><div className="flex h-10 items-center justify-between border-b border-border/70 px-3"><div className="flex items-center gap-2 text-[10px] font-semibold"><Clock3 className="h-3.5 w-3.5 text-primary" />Animation timeline <span className="font-normal text-muted-foreground">{canvasTemplate?.elements?.reduce((count, element) => count + (element.animations?.length || 0), 0) || 0} tracks</span></div><div className="flex items-center gap-1"><button type="button" onClick={() => setRightPanel("animations")} className="rounded-md px-2 py-1 text-[8px] text-primary hover:bg-primary/10">Animation Studio</button><button type="button" title={timelineCollapsed ? "Expand timeline" : "Collapse timeline"} onClick={() => setTimelineCollapsed((value) => !value)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><ChevronDown className={`h-3.5 w-3.5 transition ${timelineCollapsed ? "rotate-180" : ""}`} /></button></div></div>{!timelineCollapsed && <div className="h-[90px] px-2 py-1"><AnimationTimeline template={canvasTemplate} selectedIds={canvasSelection} onSelect={selectTimelineLayer} timeMs={animationTimeMs} onTimeChange={setAnimationTime} playing={animationPlaying} onPlayingChange={setAnimationPlayback} /></div>}</div>
                  </div>
                </ResizablePanel>
                {rightDocked && <><ResizableHandle withHandle className="hidden w-1 rounded-full bg-border/50 transition hover:bg-primary/50 md:flex" /><ResizablePanel defaultSize={24} minSize={16} maxSize={34} className="hidden min-w-0 md:block">{rightSidebar}</ResizablePanel></>}
              </ResizablePanelGroup>
              {!leftDocked && <div className="absolute left-4 top-4 z-20 h-[min(70vh,680px)] w-[min(340px,88vw)] shadow-2xl">{leftSidebar}</div>}
              {!rightDocked && <div className="absolute right-4 top-4 z-20 h-[min(70vh,680px)] w-[min(330px,88vw)] shadow-2xl">{rightSidebar}</div>}
            </div>
            <footer className="flex min-h-10 shrink-0 items-center justify-between border-t border-border/70 bg-card/55 px-4 text-[9px] text-muted-foreground backdrop-blur-xl"><span className="hidden sm:inline">Space to pan ï¿½ Shift-click to multi-select</span><span className="sm:hidden">Editor workspace</span><div className="flex items-center gap-3"><span>Preview uses the selected project image</span>{canExport && media?.template_export && <button type="button" onClick={revertTemplate} disabled={!!busy} className="transition hover:text-foreground">{busy === "revert" ? "Revertingï¿½" : "Revert applied template"}</button>}</div></footer>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}

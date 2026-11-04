import { useState } from "react";
import { toast } from "sonner";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "@/lib/api";
import { BeforeAfter } from "@/components/post/Previews";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

const MODES = [
  { value: "professional", label: "Professional", detail: "Natural editorial finish" },
  { value: "luxury", label: "Luxury", detail: "Refined tonal depth" },
  { value: "bright", label: "Bright", detail: "Lifted, balanced light" },
  { value: "instagram_ready", label: "Instagram Ready", detail: "Polished social finish" },
  { value: "custom_prompt", label: "Custom Prompt", detail: "Your creative direction" },
];

export default function GPTEnhancementModal({
  media,
  imageUrl,
  buttonLabel = "AI Edit",
  buttonTestId = `approval-ai-edit-${media.id}`,
  disabled = false,
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("professional");
  const [customPrompt, setCustomPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(null);

  const generate = async () => {
    setBusy("generate");
    try {
      const { data } = await api.post(`/media/${media.id}/enhance-gpt`, {
        mode,
        custom_prompt: mode === "custom_prompt" ? customPrompt.trim() : null,
        preview_only: true,
      });
      if (data.status !== "completed" || !data.image_url) {
        throw new Error(data.error || "The AI preview could not be created.");
      }
      setPreviewUrl(data.image_url);
      toast.success(previewUrl ? "A new AI preview is ready" : "AI preview is ready");
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(null);
    }
  };

  const discardPreview = async () => {
    if (previewUrl) {
      setBusy("discard");
      try {
        await api.post(`/media/${media.id}/enhance-gpt/discard`);
      } catch (error) {
        toast.error(errMsg(error));
        setBusy(null);
        return false;
      }
      setBusy(null);
    }
    setPreviewUrl(null);
    setOpen(false);
    return true;
  };

  const changeOpen = async (nextOpen) => {
    if (busy) return;
    if (!nextOpen && previewUrl) {
      await discardPreview();
      return;
    }
    if (nextOpen) {
      setMode("professional");
      setCustomPrompt("");
      setPreviewUrl(null);
    }
    setOpen(nextOpen);
  };

  const apply = async () => {
    setBusy("apply");
    try {
      await api.post(`/media/${media.id}/enhance-gpt/apply`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["post"] }),
        queryClient.invalidateQueries({ queryKey: ["media"] }),
        queryClient.invalidateQueries({ queryKey: ["ai-dashboard-records"] }),
        queryClient.invalidateQueries({ queryKey: ["ai-dashboard-adaptive-presets"] }),
        queryClient.refetchQueries({ queryKey: ["ai-dashboard-records"], type: "all" }),
      ]);
      setPreviewUrl(null);
      setOpen(false);
      toast.success("AI enhancement applied");
    } catch (error) {
      toast.error(errMsg(error));
    } finally {
      setBusy(null);
    }
  };

  const keepOriginal = async () => {
    if (await discardPreview()) toast.success("Original image kept");
  };

  const canGenerate = !busy && (mode !== "custom_prompt" || !!customPrompt.trim());

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-full border-gold/40 bg-gold/10 px-3 text-gold transition-colors hover:border-gold/70 hover:bg-gold/20 hover:text-gold"
        onClick={() => changeOpen(true)}
        disabled={disabled}
        data-testid={buttonTestId}
      >
        <span className="mr-1" aria-hidden="true">✨</span>{buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="block max-h-[92vh] max-w-5xl overflow-y-auto rounded-3xl border-border/70 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8" data-testid="approval-ai-edit-dialog">
          <DialogHeader className="mb-6 pr-8">
            <div className="eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-gold" />Premium image refinement</div>
            <DialogTitle className="font-display text-3xl">AI Enhancement</DialogTitle>
            <DialogDescription>Refine the photograph while keeping your original image and post details safe.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
            <div className="relative min-h-[280px] overflow-hidden rounded-2xl border border-border/70 bg-muted/40">
              {previewUrl ? (
                <BeforeAfter before={imageUrl} after={previewUrl} afterLabel="AI EDIT" />
              ) : (
                <img src={imageUrl} alt="Current approval image" className="aspect-[4/5] max-h-[62vh] w-full object-contain" />
              )}
              {busy === "generate" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 text-center backdrop-blur-sm">
                  <LoaderCircle className="h-8 w-8 animate-spin text-gold" />
                  <div className="text-sm font-medium">Refining your image</div>
                  <div className="text-xs text-muted-foreground">This can take a little while. Keep this window open.</div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-3 text-sm font-medium">Choose an enhancement mode</div>
                <RadioGroup value={mode} onValueChange={setMode} className="grid grid-cols-2 gap-2" disabled={!!busy}>
                  {MODES.map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`approval-ai-mode-${media.id}-${option.value}`}
                      className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-all ${mode === option.value ? "border-gold/60 bg-gold/10 shadow-[0_0_20px_rgba(198,166,112,.08)]" : "border-border/70 bg-background/50 hover:border-gold/30"} ${option.value === "custom_prompt" ? "col-span-2" : ""}`}
                    >
                      <RadioGroupItem id={`approval-ai-mode-${media.id}-${option.value}`} value={option.value} className="mt-0.5 border-gold text-gold" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">{option.detail}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {mode === "custom_prompt" && (
                <div className="space-y-2">
                  <label htmlFor={`approval-ai-prompt-${media.id}`} className="text-xs font-medium">Custom photographic direction</label>
                  <Textarea
                    id={`approval-ai-prompt-${media.id}`}
                    value={customPrompt}
                    onChange={(event) => setCustomPrompt(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Describe the photographic finish you want…"
                    className="resize-none rounded-xl border-border/70 bg-background/60 text-sm"
                    disabled={!!busy}
                    data-testid="approval-ai-custom-prompt"
                  />
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">AI edits adjust photographic finish only. Your caption, hashtags, template, approval status, and history remain unchanged.</p>

              {!previewUrl ? (
                <Button className="w-full rounded-full bg-gold text-black hover:bg-gold/90" onClick={generate} disabled={!canGenerate} data-testid="approval-ai-generate">
                  {busy === "generate" ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Generating…</> : <><Sparkles className="mr-2 h-4 w-4" />Generate preview</>}
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-full" onClick={keepOriginal} disabled={!!busy} data-testid="approval-ai-keep-original">
                    {busy === "discard" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Keep Original"}
                  </Button>
                  <Button variant="outline" className="rounded-full border-gold/40 text-gold hover:bg-gold/10 hover:text-gold" onClick={generate} disabled={!canGenerate} data-testid="approval-ai-regenerate">
                    {busy === "generate" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Regenerate"}
                  </Button>
                  <Button className="col-span-2 rounded-full bg-gold text-black hover:bg-gold/90" onClick={apply} disabled={!!busy} data-testid="approval-ai-apply">
                    {busy === "apply" ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Applying…</> : "Apply Changes"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

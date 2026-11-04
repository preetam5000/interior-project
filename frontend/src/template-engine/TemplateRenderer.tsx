import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { CanvasRenderer } from "./renderers/CanvasRenderer";
import type {
  OutputMimeType,
  OutputVariant,
  RenderContext,
  RenderResult,
  TemplateConfig,
} from "./types";

export interface TemplateRendererHandle {
  exportImage(
    variant: OutputVariant,
    mimeType?: OutputMimeType,
    quality?: number,
  ): Promise<RenderResult>;
}

export interface TemplateRendererProps {
  config: TemplateConfig | string;
  imageSrc: string;
  variant?: OutputVariant;
  content?: Record<string, string>;
  brand?: Record<string, string>;
  className?: string;
  onRendered?: (canvas: HTMLCanvasElement) => void;
  onError?: (error: Error) => void;
}

const renderer = new CanvasRenderer();

export const TemplateRenderer = forwardRef<TemplateRendererHandle, TemplateRendererProps>(
  function TemplateRenderer(
    {
      config,
      imageSrc,
      variant = "portrait",
      content,
      brand,
      className,
      onRendered,
      onError,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [errorMessage, setErrorMessage] = useState("");
    const renderContext: RenderContext = { imageSrc, content, brand };

    useImperativeHandle(ref, () => ({
      exportImage: (outputVariant, mimeType = "image/png", quality = 0.92) =>
        renderer.export(
          { template: config, context: renderContext, variant: outputVariant },
          mimeType,
          quality,
        ),
    }), [config, imageSrc, content, brand]);

    useEffect(() => {
      let active = true;
      const canvas = canvasRef.current;
      if (!canvas) return undefined;
      setErrorMessage("");
      renderer.render({ template: config, context: renderContext, variant })
        .then((rendered) => {
          if (!active) return;
          canvas.width = rendered.width;
          canvas.height = rendered.height;
          const canvasContext = canvas.getContext("2d");
          if (!canvasContext) throw new Error("This browser does not support a 2D canvas renderer.");
          canvasContext.drawImage(rendered, 0, 0);
          onRendered?.(canvas);
        })
        .catch((error: unknown) => {
          if (!active) return;
          const renderError = error instanceof Error ? error : new Error(String(error));
          setErrorMessage(renderError.message);
          onError?.(renderError);
        });
      return () => {
        active = false;
      };
    }, [config, imageSrc, variant, content, brand, onRendered, onError]);

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          aria-label="Template image preview"
          style={{ display: "block", height: "auto", maxWidth: "100%", width: "100%" }}
        />
        {errorMessage && <p role="alert">{errorMessage}</p>}
      </div>
    );
  },
);

TemplateRenderer.displayName = "TemplateRenderer";

export default TemplateRenderer;

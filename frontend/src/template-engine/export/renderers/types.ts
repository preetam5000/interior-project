import type { PreparedExport, ExportSurface, ExportSourceKind } from "../types";

export interface ExportRenderer {
  readonly sourceKind: ExportSourceKind;
  render(prepared: PreparedExport): Promise<ExportSurface>;
}

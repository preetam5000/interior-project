import { useState } from "react";
export function useSelection() { const [selectedId, setSelectedId] = useState<string | null>(null); return { selectedId, select: setSelectedId, clear: () => setSelectedId(null) }; }

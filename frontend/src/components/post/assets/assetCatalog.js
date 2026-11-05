const GROUPS = {
  Icons: ["Spark", "Sun", "Moon", "Leaf", "Heart", "Star", "Check", "Arrow", "Plus", "Play", "Camera", "Mail"],
  Shapes: ["Circle", "Pill", "Arch", "Wave", "Diamond", "Starburst", "Rounded square", "Oval"],
  Frames: ["Arch frame", "Circle frame", "Polaroid", "Editorial frame", "Soft corner", "Double border"],
  SVG: ["Outline flower", "Line sun", "Botanical sprig", "Geometric mark", "Abstract face", "Orbit"],
  Gradients: ["Warm sunset", "Olive haze", "Rose glow", "Ocean fade", "Sandstone", "Violet dusk"],
  Textures: ["Fine grain", "Paper fiber", "Linen", "Concrete", "Marble", "Plaster"],
  Patterns: ["Arch repeat", "Checkerboard", "Fine grid", "Terrazzo", "Contour lines", "Dot field"],
  "Abstract blobs": ["Organic pebble", "Soft wave", "Fluid form", "Cutout blob", "Ripple", "Folded shape"],
  "Furniture icons": ["Lounge chair", "Sofa", "Dining table", "Pendant light", "Floor lamp", "Side table", "Bed", "Cabinet"],
  "Architecture icons": ["House", "Tower", "Window", "Doorway", "Column", "Roofline", "Floor plan", "Facade"],
  "Construction icons": ["Hard hat", "Crane", "Blueprint", "Hammer", "Safety vest", "Site plan", "Brickwork", "Progress"],
  "Social icons": ["Instagram", "Facebook", "Pinterest", "YouTube", "LinkedIn", "TikTok"],
  "Location icons": ["Map pin", "Compass", "Globe", "Route", "Landmark", "Map"],
  Badges: ["New", "Trending", "Luxury", "Premium", "Featured", "Limited", "Verified", "Award"],
  Buttons: ["Rounded CTA", "Outline CTA", "Arrow button", "Glass button", "Gold button", "Pill link"],
  Backgrounds: ["Ivory wash", "Charcoal studio", "Olive canvas", "Blush paper", "Sand gradient", "Blue hour"],
  "Overlay PNG": ["Light leak", "Film grain", "Soft flare", "Dust overlay", "Shadow wash", "Bokeh"],
  Mockups: ["Story frame", "Phone screen", "Magazine spread", "Poster wall", "Canvas print", "Tablet frame"],
  Illustrations: ["Plant in pot", "Interior vignette", "Floor plan sketch", "Building outline", "Material swatches", "Work in progress"],
};

const escapeSvg = (value) => encodeURIComponent(value).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
const PALETTES = [["#b08a5a", "#f3e8d7"], ["#7f8d75", "#e7eadf"], ["#ba8277", "#f5e6e1"], ["#748ea1", "#e5edf1"], ["#9c8b78", "#eee8df"]];

function illustration(title, category, index) {
  const [accent, wash] = PALETTES[index % PALETTES.length];
  const shape = index % 6;
  const drawing = shape === 0 ? `<circle cx="48" cy="48" r="27" fill="${accent}"/>` : shape === 1 ? `<path d="M22 70V45a26 26 0 0 1 52 0v25z" fill="${accent}"/>` : shape === 2 ? `<path d="M20 68c2-25 21-45 48-44 11 1 15 8 12 17-4 12-21 12-22 26-1 9-15 14-38 1z" fill="${accent}"/>` : shape === 3 ? `<rect x="23" y="23" width="50" height="50" rx="18" fill="${accent}"/>` : shape === 4 ? `<path d="M20 58c18-42 45-42 60 0M20 67c18-32 42-33 60 0" fill="none" stroke="${accent}" stroke-width="4"/>` : `<path d="M48 16 58 38 82 40 64 56 69 80 48 68 27 80 32 56 14 40 38 38z" fill="${accent}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${wash}"/>${drawing}<text x="48" y="88" text-anchor="middle" font-family="Arial,sans-serif" font-size="6" fill="#574f46">${title}</text></svg>`;
  return `data:image/svg+xml,${escapeSvg(svg)}`;
}

function elementFor(category, title, index, preview) {
  const id = `${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const base = { id: `asset-${id}`, x: 0.36, y: 0.38, width: 0.28, height: 0.24, rotation: 0, opacity: 1, zIndex: 0, visible: true, locked: false, alignment: "center", content: title, color: "$colors.text", style: { background: "transparent" } };
  if (category === "Gradients" || category === "Backgrounds") return { ...base, type: "Gradient", gradient: { type: "linear", angle: (index * 37) % 360, stops: [{ color: PALETTES[index % 5][0], position: 0 }, { color: PALETTES[index % 5][1], position: 1 }] }, width: category === "Backgrounds" ? 0.78 : 0.36, height: category === "Backgrounds" ? 0.5 : 0.28 };
  if (category === "Badges") return { ...base, type: "Badge", content: title.toUpperCase(), width: 0.24, height: 0.075, radius: 0.04, style: { background: PALETTES[index % 5][0] }, color: "#ffffff", fontSize: 22 };
  if (category === "Buttons") return { ...base, type: "CTA Button", content: title, width: 0.34, height: 0.09, radius: 0.045, style: { background: PALETTES[index % 5][0] }, color: "#ffffff", fontSize: 24 };
  if (["Shapes", "Abstract blobs"].includes(category)) return { ...base, type: "Shape", width: 0.28, height: 0.22, radius: shapeRadius(index), style: { background: PALETTES[index % 5][0] }, content: "" };
  return { ...base, type: "Image", source: preview, content: title, crop: "contain", width: category.includes("Overlay") ? 0.7 : 0.23, height: category.includes("Overlay") ? 0.5 : 0.2 };
}

function shapeRadius(index) { return index % 3 === 0 ? 0.11 : index % 3 === 1 ? 0.04 : 0.02; }

export const ASSET_CATEGORIES = ["All", "Favorites", "Recent", ...Object.keys(GROUPS)];
export const ASSET_CATALOG = Object.entries(GROUPS).flatMap(([category, titles]) => titles.map((title, index) => {
  const preview = illustration(title, category, index + Object.keys(GROUPS).indexOf(category));
  return { id: `${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, title, category, tags: [category.toLowerCase(), title.toLowerCase(), "interior design", "social studio"], format: "SVG", preview, element: elementFor(category, title, index, preview), metadata: { license: "Built-in", source: "Interior Studio library", scalable: true } };
}));

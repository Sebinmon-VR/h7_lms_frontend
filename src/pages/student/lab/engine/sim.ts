import { SUBSTANCES, substance, type Substance } from './substances'

/**
 * The lab's chemistry simulation.
 *
 * A vessel holds amounts: millilitres of water under `h2o`, millimoles of
 * everything else. Each tick (`stepVessel`) dissolves what dissolves,
 * neutralises acids and alkalis, runs every reaction whose ingredients and
 * conditions are present, moves heat, boils, and lets precipitates settle.
 *
 * Reactions are written on ions where chemistry works that way, so silver
 * nitrate meets *any* chloride and barium chloride meets *any* sulfate,
 * instead of one rule per bottle. Anything without a rule simply mixes:
 * "no visible reaction" is a real answer, not a gap filled with invention.
 */

// ---------------------------------------------------------------------- ions

/** Which ions each dissolved substance supplies, per mmol. */
export const IONS: Record<string, Record<string, number>> = {
  hcl: { 'H+': 1, 'Cl-': 1 },
  h2so4: { 'H+': 2, 'SO4': 1 },
  hno3: { 'H+': 1, 'NO3-': 1 },
  ch3cooh: { 'H+': 1 },
  naoh: { 'OH-': 1, 'Na+': 1 },
  koh: { 'OH-': 1, 'K+': 1 },
  caoh2: { 'OH-': 2, 'Ca2+': 1 },
  nh3: { 'OH-': 1 },
  nacl: { 'Na+': 1, 'Cl-': 1 },
  kcl: { 'K+': 1, 'Cl-': 1 },
  licl: { 'Cl-': 1 },
  cacl2: { 'Ca2+': 1, 'Cl-': 2 },
  srcl2: { 'Cl-': 2 },
  bacl2: { 'Ba2+': 1, 'Cl-': 2 },
  agno3: { 'Ag+': 1, 'NO3-': 1 },
  pbno32: { 'Pb2+': 1, 'NO3-': 2 },
  ki: { 'K+': 1, 'I-': 1 },
  na2so4: { 'Na+': 2, 'SO4': 1 },
  na2co3: { 'Na+': 2, 'CO3': 1 },
  nahco3: { 'Na+': 1, 'HCO3': 1 },
  cuso4: { 'Cu2+': 1, 'SO4': 1 },
  cucl2: { 'Cu2+': 1, 'Cl-': 2 },
  cuno32: { 'Cu2+': 1, 'NO3-': 2 },
  feso4: { 'Fe2+': 1, 'SO4': 1 },
  fecl2: { 'Fe2+': 1, 'Cl-': 2 },
  fecl3: { 'Fe3+': 1, 'Cl-': 3 },
  fe2so43: { 'Fe3+': 2, 'SO4': 3 },
  kscn: { 'K+': 1, 'SCN-': 1 },
  kmno4: { 'K+': 1, 'MnO4-': 1 },
  na2s2o3: { 'Na+': 2, 'S2O3': 1 },
  nh4cl: { 'NH4+': 1, 'Cl-': 1 },
  mgcl2: { 'Cl-': 2 },
  zncl2: { 'Cl-': 2 },
  znso4: { 'SO4': 1 },
  mgso4: { 'SO4': 1 },
  mnso4: { 'SO4': 1 },
}

/** Strong acids and alkalis neutralise at once; weak ones still do, more gently. */
const WEAK = new Set(['ch3cooh', 'nh3', 'na2co3'])

// ------------------------------------------------------------------ reactions

export type Bubbles = 'gentle' | 'fizz' | 'vigorous' | 'violent'

export interface Reaction {
  id: string
  name: string
  equation: string
  /** Substance ids, or ions written '@Cl-'. Coefficients in mmol. */
  reactants: Array<{ id: string; n: number }>
  products: Array<{ id: string; n: number }>
  /** Present but not used up: all of these… */
  catalyst?: string[]
  /** …and at least one of these. */
  catalystAny?: string[]
  /** Water must be in the vessel (most ionic reactions happen in solution). */
  water?: boolean
  /** Only above this temperature (°C): heating reactions. */
  minTemp?: number
  /** Only with no water at all (dry heating). */
  dry?: boolean
  /** mmol of reaction per second at a typical concentration. */
  rate: number
  /** °C·mL released (+) or absorbed (−) per mmol of reaction. */
  heat?: number
  bubbles?: Bubbles
  /** Effects drawn while it runs. */
  light?: [number, number, number]
  flame?: [number, number, number]
  smoke?: [number, number, number]
  sparks?: boolean
  foam?: boolean
  sound?: 'fizz' | 'pop' | 'hiss' | 'crackle'
  observation: string
}

const R = (r: Reaction) => r

export const REACTIONS: Reaction[] = [
  // Precipitation: two clear solutions make a solid.
  R({ id: 'agcl', name: 'Silver chloride precipitate', equation: 'Ag⁺ + Cl⁻ → AgCl↓', reactants: [{ id: '@Ag+', n: 1 }, { id: '@Cl-', n: 1 }], products: [{ id: 'agcl', n: 1 }], water: true, rate: 40, observation: 'A thick white precipitate forms at once.' }),
  R({ id: 'agi', name: 'Silver iodide precipitate', equation: 'Ag⁺ + I⁻ → AgI↓', reactants: [{ id: '@Ag+', n: 1 }, { id: '@I-', n: 1 }], products: [{ id: 'agi', n: 1 }], water: true, rate: 40, observation: 'A pale yellow precipitate forms.' }),
  R({ id: 'baso4', name: 'Barium sulfate precipitate', equation: 'Ba²⁺ + SO₄²⁻ → BaSO₄↓', reactants: [{ id: '@Ba2+', n: 1 }, { id: '@SO4', n: 1 }], products: [{ id: 'baso4', n: 1 }], water: true, rate: 40, observation: 'A dense white precipitate forms — the test for sulfate ions.' }),
  R({ id: 'pbi2', name: 'Golden rain', equation: 'Pb²⁺ + 2I⁻ → PbI₂↓', reactants: [{ id: '@Pb2+', n: 1 }, { id: '@I-', n: 2 }], products: [{ id: 'pbi2', n: 1 }], water: true, rate: 30, observation: 'A bright yellow precipitate of lead(II) iodide appears.' }),
  R({ id: 'cuoh2', name: 'Copper(II) hydroxide precipitate', equation: 'Cu²⁺ + 2OH⁻ → Cu(OH)₂↓', reactants: [{ id: '@Cu2+', n: 1 }, { id: '@OH-', n: 2 }], products: [{ id: 'cuoh2', n: 1 }], water: true, rate: 30, observation: 'A pale blue precipitate forms.' }),
  R({ id: 'feoh3', name: 'Iron(III) hydroxide precipitate', equation: 'Fe³⁺ + 3OH⁻ → Fe(OH)₃↓', reactants: [{ id: '@Fe3+', n: 1 }, { id: '@OH-', n: 3 }], products: [{ id: 'feoh3', n: 1 }], water: true, rate: 30, observation: 'A red-brown, jelly-like precipitate forms.' }),
  R({ id: 'feoh2', name: 'Iron(II) hydroxide precipitate', equation: 'Fe²⁺ + 2OH⁻ → Fe(OH)₂↓', reactants: [{ id: '@Fe2+', n: 1 }, { id: '@OH-', n: 2 }], products: [{ id: 'feoh2', n: 1 }], water: true, rate: 30, observation: 'A dirty green precipitate forms.' }),
  R({ id: 'caco3ppt', name: 'Calcium carbonate precipitate', equation: 'Ca²⁺ + CO₃²⁻ → CaCO₃↓', reactants: [{ id: '@Ca2+', n: 1 }, { id: '@CO3', n: 1 }], products: [{ id: 'caco3ppt', n: 1 }], water: true, rate: 30, observation: 'The mixture turns milky white.' }),
  R({ id: 'limewater', name: 'Limewater turns milky', equation: 'Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O', reactants: [{ id: 'caoh2', n: 1 }, { id: 'co2', n: 1 }], products: [{ id: 'caco3ppt', n: 1 }], water: true, rate: 8, observation: 'The limewater turns milky — carbon dioxide is present.' }),
  R({ id: 'fescn', name: 'Blood-red complex', equation: 'Fe³⁺ + SCN⁻ → [Fe(SCN)]²⁺', reactants: [{ id: '@Fe3+', n: 1 }, { id: '@SCN-', n: 1 }], products: [{ id: 'fescn', n: 1 }], water: true, rate: 40, observation: 'The solution turns a deep blood red — the test for iron(III).' }),

  // Acids with carbonates: fizzing carbon dioxide.
  R({ id: 'acid_co3', name: 'Acid + carbonate', equation: '2H⁺ + CO₃²⁻ → H₂O + CO₂↑', reactants: [{ id: '@H+', n: 2 }, { id: '@CO3', n: 1 }], products: [{ id: 'co2', n: 1 }], water: true, rate: 12, heat: 0.05, bubbles: 'vigorous', sound: 'fizz', observation: 'Vigorous fizzing as carbon dioxide is given off.' }),
  R({ id: 'acid_hco3', name: 'Acid + hydrogencarbonate', equation: 'H⁺ + HCO₃⁻ → H₂O + CO₂↑', reactants: [{ id: '@H+', n: 1 }, { id: '@HCO3', n: 1 }], products: [{ id: 'co2', n: 1 }], water: true, rate: 14, heat: -0.08, bubbles: 'vigorous', sound: 'fizz', observation: 'Lots of fizzing — carbon dioxide. The mixture cools slightly.' }),
  R({ id: 'acid_marble', name: 'Acid + marble chips', equation: 'CaCO₃ + 2H⁺ → Ca²⁺ + H₂O + CO₂↑', reactants: [{ id: 'caco3', n: 1 }, { id: '@H+', n: 2 }], products: [{ id: 'cacl2', n: 1 }, { id: 'co2', n: 1 }], water: true, rate: 0.12, heat: 0.05, bubbles: 'fizz', sound: 'fizz', observation: 'The marble chips fizz steadily and slowly shrink.' }),

  // Metals with acids: hydrogen.
  R({ id: 'mg_acid', name: 'Magnesium + acid', equation: 'Mg + 2H⁺ → Mg²⁺ + H₂↑', reactants: [{ id: 'mg', n: 1 }, { id: '@H+', n: 2 }], products: [{ id: 'mgcl2', n: 1 }, { id: 'h2', n: 1 }], water: true, rate: 0.16, heat: 1.6, bubbles: 'vigorous', sound: 'fizz', observation: 'Rapid fizzing; the magnesium disappears and the tube gets warm. Hydrogen is given off.' }),
  R({ id: 'zn_acid', name: 'Zinc + acid', equation: 'Zn + 2H⁺ → Zn²⁺ + H₂↑', reactants: [{ id: 'zn', n: 1 }, { id: '@H+', n: 2 }], products: [{ id: 'zncl2', n: 1 }, { id: 'h2', n: 1 }], water: true, rate: 0.05, heat: 0.9, bubbles: 'fizz', sound: 'fizz', observation: 'Steady bubbles of hydrogen rise from the zinc.' }),
  R({ id: 'fe_acid', name: 'Iron + acid', equation: 'Fe + 2H⁺ → Fe²⁺ + H₂↑', reactants: [{ id: 'fe', n: 1 }, { id: '@H+', n: 2 }], products: [{ id: 'fecl2', n: 1 }, { id: 'h2', n: 1 }], water: true, rate: 0.02, heat: 0.5, bubbles: 'gentle', observation: 'Slow bubbles of hydrogen; the solution turns pale green.' }),
  R({ id: 'al_acid', name: 'Aluminium + acid', equation: '2Al + 6H⁺ → 2Al³⁺ + 3H₂↑', reactants: [{ id: 'al', n: 2 }, { id: '@H+', n: 6 }], products: [{ id: 'h2', n: 3 }], water: true, rate: 0.03, heat: 1.2, bubbles: 'fizz', observation: 'After a short delay the foil starts fizzing as its oxide layer is eaten away.' }),
  R({ id: 'ca_acid', name: 'Calcium + acid', equation: 'Ca + 2H⁺ → Ca²⁺ + H₂↑', reactants: [{ id: 'ca', n: 1 }, { id: '@H+', n: 2 }], products: [{ id: 'cacl2', n: 1 }, { id: 'h2', n: 1 }], water: true, rate: 0.2, heat: 1.6, bubbles: 'vigorous', sound: 'fizz', observation: 'Very rapid fizzing — hydrogen.' }),

  // Reactive metals with water.
  R({ id: 'na_water', name: 'Sodium + water', equation: '2Na + 2H₂O → 2NaOH + H₂↑', reactants: [{ id: 'na', n: 2 }], products: [{ id: 'naoh', n: 2 }, { id: 'h2', n: 1 }], water: true, rate: 1.2, heat: 3, bubbles: 'violent', sparks: true, sound: 'hiss', observation: 'The sodium floats, melts into a silvery ball and whizzes around fizzing. The water becomes alkaline.' }),
  R({ id: 'k_water', name: 'Potassium + water', equation: '2K + 2H₂O → 2KOH + H₂↑', reactants: [{ id: 'k', n: 2 }], products: [{ id: 'koh', n: 2 }, { id: 'h2', n: 1 }], water: true, rate: 2, heat: 4, bubbles: 'violent', flame: [200, 140, 255], sparks: true, sound: 'crackle', observation: 'The potassium bursts into a lilac flame and skates across the water, crackling.' }),
  R({ id: 'ca_water', name: 'Calcium + water', equation: 'Ca + 2H₂O → Ca(OH)₂ + H₂↑', reactants: [{ id: 'ca', n: 1 }], products: [{ id: 'caoh2', n: 1 }, { id: 'h2', n: 1 }], water: true, rate: 0.15, heat: 1.2, bubbles: 'fizz', sound: 'fizz', observation: 'Steady fizzing; the water turns cloudy as calcium hydroxide forms.' }),

  // Displacement: a more reactive metal pushes a less reactive one out.
  R({ id: 'fe_cu', name: 'Iron displaces copper', equation: 'Fe + Cu²⁺ → Fe²⁺ + Cu', reactants: [{ id: 'fe', n: 1 }, { id: '@Cu2+', n: 1 }], products: [{ id: 'feso4', n: 1 }, { id: 'cu', n: 1 }], water: true, rate: 0.08, heat: 0.4, observation: 'A pink-brown coat of copper forms on the iron and the blue colour fades to pale green.' }),
  R({ id: 'zn_cu', name: 'Zinc displaces copper', equation: 'Zn + Cu²⁺ → Zn²⁺ + Cu', reactants: [{ id: 'zn', n: 1 }, { id: '@Cu2+', n: 1 }], products: [{ id: 'znso4', n: 1 }, { id: 'cu', n: 1 }], water: true, rate: 0.12, heat: 0.8, observation: 'The zinc turns brown with copper and the blue solution fades to colourless. It warms up.' }),
  R({ id: 'mg_cu', name: 'Magnesium displaces copper', equation: 'Mg + Cu²⁺ → Mg²⁺ + Cu', reactants: [{ id: 'mg', n: 1 }, { id: '@Cu2+', n: 1 }], products: [{ id: 'mgso4', n: 1 }, { id: 'cu', n: 1 }], water: true, rate: 0.35, heat: 1.5, bubbles: 'gentle', observation: 'Fast reaction: copper forms, the blue fades and the mixture gets hot.' }),
  R({ id: 'cu_ag', name: 'Copper displaces silver', equation: 'Cu + 2Ag⁺ → Cu²⁺ + 2Ag', reactants: [{ id: 'cu', n: 1 }, { id: '@Ag+', n: 2 }], products: [{ id: 'cuno32', n: 1 }, { id: 'ag', n: 2 }], water: true, rate: 0.05, observation: 'Shiny silver crystals grow on the copper and the solution slowly turns blue.' }),

  // Catalysis.
  R({ id: 'h2o2_foam', name: 'Elephant toothpaste', equation: '2H₂O₂ → 2H₂O + O₂↑ (catalysed, trapped in soap)', reactants: [{ id: 'h2o2', n: 2 }], products: [{ id: 'o2', n: 1 }, { id: 'foam', n: 1 }], catalyst: ['soap'], catalystAny: ['ki', 'mno2'], water: true, rate: 6, heat: 0.6, bubbles: 'violent', foam: true, sound: 'hiss', observation: 'A huge column of warm foam erupts from the flask — oxygen trapped in soap.' }),
  R({ id: 'h2o2_mno2', name: 'Catalytic decomposition', equation: '2H₂O₂ → 2H₂O + O₂↑ (MnO₂ catalyst)', reactants: [{ id: 'h2o2', n: 2 }], products: [{ id: 'o2', n: 1 }], catalyst: ['mno2'], water: true, rate: 5, heat: 0.6, bubbles: 'vigorous', sound: 'fizz', observation: 'Vigorous fizzing. The black powder is unchanged — it is a catalyst. Oxygen is given off.' }),
  R({ id: 'h2o2_ki', name: 'Catalytic decomposition', equation: '2H₂O₂ → 2H₂O + O₂↑ (iodide catalyst)', reactants: [{ id: 'h2o2', n: 2 }], products: [{ id: 'o2', n: 1 }], catalyst: ['ki'], water: true, rate: 3, heat: 0.5, bubbles: 'fizz', observation: 'Steady fizzing — oxygen, with the iodide acting as a catalyst.' }),

  // Tests and colour changes.
  R({ id: 'starch_iodine', name: 'Starch test', equation: 'I₂ + starch → blue-black complex', reactants: [{ id: 'iodine', n: 1 }, { id: 'starch', n: 1 }], products: [{ id: 'starchI', n: 1 }], water: true, rate: 20, observation: 'The mixture turns blue-black — starch is present.' }),
  R({ id: 'starchpow_iodine', name: 'Starch test', equation: 'I₂ + starch → blue-black complex', reactants: [{ id: 'iodine', n: 1 }, { id: 'starchpow', n: 0.2 }], products: [{ id: 'starchI', n: 1 }], water: true, rate: 20, observation: 'The mixture turns blue-black — starch is present.' }),
  R({ id: 'thio', name: 'Disappearing cross', equation: 'S₂O₃²⁻ + 2H⁺ → S↓ + SO₂ + H₂O', reactants: [{ id: '@S2O3', n: 1 }, { id: '@H+', n: 2 }], products: [{ id: 'sppt', n: 1 }, { id: 'so2', n: 1 }], water: true, rate: 0.35, observation: 'The solution slowly turns cloudy yellow as sulfur forms.' }),
  R({ id: 'mno4_fe', name: 'Manganate(VII) decolourised', equation: 'MnO₄⁻ + 5Fe²⁺ + 8H⁺ → Mn²⁺ + 5Fe³⁺ + 4H₂O', reactants: [{ id: '@MnO4-', n: 1 }, { id: '@Fe2+', n: 5 }, { id: '@H+', n: 8 }], products: [{ id: 'mnso4', n: 1 }, { id: 'fe2so43', n: 2.5 }], water: true, rate: 3, observation: 'The purple colour vanishes instantly as the manganate(VII) is reduced.' }),
  R({ id: 'nh4_oh', name: 'Ammonia given off', equation: 'NH₄⁺ + OH⁻ → NH₃↑ + H₂O', reactants: [{ id: '@NH4+', n: 1 }, { id: '@OH-', n: 1 }], products: [{ id: 'nh3g', n: 1 }], water: true, minTemp: 45, rate: 1.5, bubbles: 'gentle', observation: 'A sharp smell of ammonia; damp red litmus held at the mouth turns blue.' }),

  // Dissolving with a change you can see or feel.
  R({ id: 'cuso4_anh_water', name: 'Water test', equation: 'CuSO₄ (white) + 5H₂O → CuSO₄·5H₂O (blue)', reactants: [{ id: 'cuso4_anh', n: 1 }], products: [{ id: 'cuso4', n: 1 }], water: true, rate: 4, heat: 1.0, observation: 'The white powder turns blue and gets hot — the test for water.' }),

  // Heating.
  R({ id: 'cuco3_heat', name: 'Thermal decomposition', equation: 'CuCO₃ → CuO + CO₂↑', reactants: [{ id: 'cuco3', n: 1 }], products: [{ id: 'cuo', n: 1 }, { id: 'co2', n: 1 }], dry: true, minTemp: 200, rate: 0.6, observation: 'The green powder turns black as carbon dioxide is driven off.' }),
  R({ id: 'cuso4_heat', name: 'Dehydration', equation: 'CuSO₄·5H₂O → CuSO₄ + 5H₂O↑', reactants: [{ id: 'cuso4_5h2o', n: 1 }], products: [{ id: 'cuso4_anh', n: 1 }, { id: 'steam', n: 5 }], dry: true, minTemp: 120, rate: 0.5, smoke: [240, 240, 245], observation: 'Steam is given off and the blue crystals crumble to a white powder.' }),
  R({ id: 'nahco3_heat', name: 'Baking soda decomposes', equation: '2NaHCO₃ → Na₂CO₃ + H₂O + CO₂↑', reactants: [{ id: 'nahco3', n: 2 }], products: [{ id: 'na2co3', n: 1 }, { id: 'co2', n: 1 }, { id: 'steam', n: 1 }], dry: true, minTemp: 120, rate: 0.6, observation: 'Carbon dioxide and steam are given off; droplets condense near the mouth.' }),
  R({ id: 'i2_sublime', name: 'Sublimation', equation: 'I₂(s) → I₂(g)', reactants: [{ id: 'i2', n: 1 }], products: [{ id: 'i2g', n: 1 }], dry: true, minTemp: 110, rate: 0.4, smoke: [140, 40, 170], observation: 'Beautiful purple vapour rises without the crystals melting — sublimation.' }),
  R({ id: 'mg_burn', name: 'Magnesium burns', equation: '2Mg + O₂ → 2MgO', reactants: [{ id: 'mg', n: 2 }], products: [{ id: 'mgo', n: 2 }], dry: true, minTemp: 500, rate: 1.4, light: [255, 255, 250], smoke: [250, 250, 248], sound: 'crackle', observation: 'A dazzling white flame — never look straight at it. A white ash of magnesium oxide is left.' }),
  R({ id: 'cu_heat', name: 'Copper oxidises', equation: '2Cu + O₂ → 2CuO', reactants: [{ id: 'cu', n: 2 }], products: [{ id: 'cuo', n: 2 }], dry: true, minTemp: 350, rate: 0.15, flame: [60, 210, 170], observation: 'The copper blackens as copper(II) oxide forms; the flame flickers blue-green.' }),
  R({ id: 's_burn', name: 'Sulfur burns', equation: 'S + O₂ → SO₂', reactants: [{ id: 's8', n: 1 }], products: [{ id: 'so2', n: 1 }], dry: true, minTemp: 250, rate: 0.4, flame: [70, 110, 255], smoke: [235, 235, 240], observation: 'Sulfur melts and burns with a pale blue flame, giving choking sulfur dioxide.' }),
  R({ id: 'sugar_heat', name: 'Sugar caramelises', equation: 'C₁₂H₂₂O₁₁ → 12C + 11H₂O', reactants: [{ id: 'sugar', n: 1 }], products: [{ id: 'steam', n: 11 }], dry: true, minTemp: 180, rate: 0.12, smoke: [120, 100, 90], observation: 'The sugar melts, turns brown, then black, giving off steam.' }),
]

// ------------------------------------------------------------------- vessels

export type VesselKind = 'beaker' | 'flask' | 'testtube' | 'boilingtube' | 'cylinder' | 'dish'

export const VESSEL_CAPACITY: Record<VesselKind, number> = {
  beaker: 250,
  flask: 250,
  testtube: 20,
  boilingtube: 40,
  cylinder: 100,
  dish: 50,
}

export interface Vessel {
  id: string
  kind: VesselKind
  capacity: number
  /** Water in mL under 'h2o'; everything else in mmol. */
  contents: Record<string, number>
  temp: number
  /** Over a lit burner (0–1 power). */
  heat: number
  /** Precipitate still drifting in the liquid (0–1 per solid); the rest has settled. */
  suspended: Record<string, number>
  /** Gas made recently, mmol, decaying: what the splint and limewater tests read. */
  gas: Record<string, number>
  /** Visual effects right now, recomputed every tick. */
  fx: VesselFx
  /** Reactions that have shown themselves here (so each is logged once). */
  seen: string[]
  /** Unique substances ever added (for the notebook). */
  added: string[]
  /** Where gas goes: another vessel id (a delivery tube), or null. */
  deliverTo?: string | null
}

export interface VesselFx {
  bubbles: number
  bubbleKind: Bubbles | null
  foam: number
  light: [number, number, number] | null
  lightLevel: number
  flame: [number, number, number] | null
  smoke: [number, number, number] | null
  smokeLevel: number
  sparks: boolean
  steam: number
  boiling: boolean
  sound: Reaction['sound'] | null
}

const ROOM = 22

export function newVessel(id: string, kind: VesselKind): Vessel {
  return {
    id,
    kind,
    capacity: VESSEL_CAPACITY[kind],
    contents: {},
    temp: ROOM,
    heat: 0,
    suspended: {},
    gas: {},
    fx: emptyFx(),
    seen: [],
    added: [],
    deliverTo: null,
  }
}

function emptyFx(): VesselFx {
  return { bubbles: 0, bubbleKind: null, foam: 0, light: null, lightLevel: 0, flame: null, smoke: null, smokeLevel: 0, sparks: false, steam: 0, boiling: false, sound: null }
}

export function water(v: Vessel) {
  return v.contents.h2o ?? 0
}

/** Litres of liquid, for concentrations. */
function litres(v: Vessel) {
  return Math.max(0.001, (water(v) + (v.contents.ethanol ?? 0)) / 1000)
}

/** Liquid level as a fraction of the vessel. */
export function fillLevel(v: Vessel) {
  const solidsMl = Object.entries(v.contents)
    .filter(([id]) => SUBSTANCES[id]?.state === 's')
    .reduce((sum, [, n]) => sum + n * 0.02, 0)
  return Math.min(1.25, (water(v) + (v.contents.ethanol ?? 0) + solidsMl) / v.capacity)
}

// ------------------------------------------------------------------- adding

export interface AddResult {
  added: number
  message?: string
}

/** Pour or tip a reagent in. `amount`: mL for liquids and solutions, grams for solids. */
export function addReagent(v: Vessel, reagent: { substance: string; molarity?: number; form: string }, amount: number): AddResult {
  const sub = substance(reagent.substance)
  if (reagent.form === 'solid') {
    const mmol = (amount / (sub.molarMass ?? 50)) * 1000
    v.contents[sub.id] = (v.contents[sub.id] ?? 0) + mmol
    if (sub.insoluble || !water(v)) v.suspended[sub.id] = 0
  } else {
    const room = Math.max(0, v.capacity * 1.02 - (water(v) + (v.contents.ethanol ?? 0)))
    const ml = Math.min(amount, room)
    if (ml <= 0) return { added: 0, message: 'It is full.' }
    if (sub.id === 'h2o' || reagent.form === 'solution') v.contents.h2o = water(v) + ml
    if (reagent.form === 'liquid' && sub.id !== 'h2o') v.contents[sub.id] = (v.contents[sub.id] ?? 0) + ml
    if (reagent.form === 'solution') v.contents[sub.id] = (v.contents[sub.id] ?? 0) + ml * (reagent.molarity ?? 1)
    amount = ml
  }
  if (!v.added.includes(sub.id)) v.added.push(sub.id)
  return { added: amount }
}

/** Pour some of one vessel into another (fraction 0–1 of what it holds). */
export function transfer(from: Vessel, to: Vessel, fraction: number) {
  const f = Math.max(0, Math.min(1, fraction))
  const room = Math.max(0, to.capacity * 1.02 - water(to))
  const scale = water(from) > 0 ? Math.min(f, room / water(from)) : f
  const before = water(to)
  const moved = water(from) * scale
  for (const [id, n] of Object.entries(from.contents)) {
    const sub = SUBSTANCES[id]
    // Settled solids stay behind unless everything is tipped out.
    const moving = sub?.state === 's' && (from.suspended[id] ?? 0) < 0.2 && scale < 0.95 ? 0 : n * scale
    if (moving <= 0) continue
    from.contents[id] = n - moving
    to.contents[id] = (to.contents[id] ?? 0) + moving
    if (sub?.state === 's') to.suspended[id] = Math.max(to.suspended[id] ?? 0, from.suspended[id] ?? 0.6)
    if (!to.added.includes(id)) to.added.push(id)
  }
  // Heat mixes by volume.
  if (before + moved > 0) to.temp = (to.temp * before + from.temp * moved) / (before + moved)
  clean(from)
}

function clean(v: Vessel) {
  for (const [id, n] of Object.entries(v.contents)) if (n < 1e-6) delete v.contents[id]
}

export function empty(v: Vessel) {
  v.contents = {}
  v.suspended = {}
  v.gas = {}
  v.temp = ROOM
  v.seen = []
  v.added = []
  v.fx = emptyFx()
}

// --------------------------------------------------------------- the step

export interface SimEvent {
  vessel: string
  kind: 'reaction' | 'neutralise' | 'boil' | 'dissolve' | 'note'
  title: string
  text: string
  equation?: string
}

const ion = (id: string) => (id.startsWith('@') ? id.slice(1) : null)

/** How many mmol of a reactant (substance or ion) the vessel can supply. */
function available(v: Vessel, id: string): number {
  const i = ion(id)
  if (!i) {
    const sub = SUBSTANCES[id]
    // Gases count only while freshly made or being bubbled in.
    if (sub?.state === 'g') return v.gas[id] ?? 0
    return v.contents[id] ?? 0
  }
  if (!water(v)) return 0
  let total = 0
  for (const [sid, n] of Object.entries(v.contents)) {
    const per = IONS[sid]?.[i]
    if (per) total += n * per
  }
  return total
}

/** Takes `amount` of a reactant out, spread across whatever supplies it. */
function consume(v: Vessel, id: string, amount: number) {
  const i = ion(id)
  if (!i) {
    const sub = SUBSTANCES[id]
    if (sub?.state === 'g') v.gas[id] = Math.max(0, (v.gas[id] ?? 0) - amount)
    else v.contents[id] = Math.max(0, (v.contents[id] ?? 0) - amount)
    return
  }
  const sources = Object.entries(v.contents).filter(([sid]) => IONS[sid]?.[i])
  const total = sources.reduce((s, [sid, n]) => s + n * IONS[sid][i], 0)
  if (total <= 0) return
  for (const [sid, n] of sources) {
    const share = (n * IONS[sid][i]) / total
    v.contents[sid] = Math.max(0, n - (amount * share) / IONS[sid][i])
  }
}

function produce(v: Vessel, id: string, amount: number) {
  const sub = substance(id)
  if (sub.state === 'g') {
    v.gas[id] = (v.gas[id] ?? 0) + amount
    return
  }
  v.contents[id] = (v.contents[id] ?? 0) + amount
  if (sub.state === 's') v.suspended[id] = Math.min(1, (v.suspended[id] ?? 0) * 0.7 + 0.9)
}

/** Soluble solids dissolve when there is water. */
const DISSOLVES: Record<string, { into: string; heat?: number; water?: number }> = {
  naoh_s: { into: 'naoh', heat: 0.9 },
  nh4cl_s: { into: 'nh4cl', heat: -0.3 },
  cuso4_5h2o: { into: 'cuso4', water: 0.09 },
  nahco3: { into: 'nahco3' },
  sugar: { into: 'sugar' },
}

/** Advances one vessel by `dt` seconds. `deliver` receives gas piped to another vessel. */
export function stepVessel(v: Vessel, dt: number, deliver?: (gas: string, amount: number) => void): SimEvent[] {
  const events: SimEvent[] = []
  const fx = emptyFx()
  const hasWater = water(v) > 0.5

  // ---- dissolving
  if (hasWater) {
    for (const [sid, rule] of Object.entries(DISSOLVES)) {
      const n = v.contents[sid] ?? 0
      if (n <= 0 || rule.into === sid) continue
      const d = Math.min(n, Math.max(0.5, n * 0.6) * dt)
      v.contents[sid] = n - d
      v.contents[rule.into] = (v.contents[rule.into] ?? 0) + d
      if (rule.water) v.contents.h2o = water(v) + d * rule.water
      if (rule.heat) v.temp += (rule.heat * d) / Math.max(5, water(v)) * 12
      if (!v.seen.includes('dissolve:' + sid)) {
        v.seen.push('dissolve:' + sid)
        const s = substance(sid)
        events.push({
          vessel: v.id,
          kind: 'dissolve',
          title: `${s.name} dissolves`,
          text: rule.heat && rule.heat > 0 ? 'The solution gets warm as it dissolves.' : rule.heat && rule.heat < 0 ? 'The solution gets noticeably colder as it dissolves.' : 'It dissolves.',
        })
      }
    }
  }

  // ---- neutralisation: H⁺ + OH⁻ → H₂O, fast and warm
  if (hasWater) {
    const h = available(v, '@H+')
    const oh = available(v, '@OH-')
    const n = Math.min(h, oh, 60 * dt)
    if (n > 1e-4) {
      consume(v, '@H+', n)
      consume(v, '@OH-', n)
      v.contents.h2o = water(v) + n * 0.018
      v.temp += (0.57 * n) / Math.max(5, water(v)) * 24
      if (!v.seen.includes('neutralise')) {
        v.seen.push('neutralise')
        events.push({ vessel: v.id, kind: 'neutralise', title: 'Neutralisation', text: 'The acid and the alkali react together and the mixture warms slightly.', equation: 'H⁺ + OH⁻ → H₂O' })
      }
    }
  }

  // ---- reactions
  for (const r of REACTIONS) {
    if (r.water && !hasWater) continue
    if (r.dry && hasWater) continue
    if (r.minTemp != null && v.temp < r.minTemp) continue
    if (r.catalyst && !r.catalyst.every((c) => (v.contents[c] ?? 0) > 0.01)) continue
    if (r.catalystAny && !r.catalystAny.some((c) => (v.contents[c] ?? 0) > 0.01)) continue
    // Extent limited by every reactant and by the rate; concentration speeds solutions up.
    let maxExtent = Infinity
    for (const re of r.reactants) maxExtent = Math.min(maxExtent, available(v, re.id) / re.n)
    if (!(maxExtent > 1e-5)) continue
    // Rate follows the concentration of what is dissolved (mol/L), never the size of a lump.
    let molar = Infinity
    for (const re of r.reactants) {
      const isSolid = !re.id.startsWith('@') && SUBSTANCES[re.id]?.state === 's'
      const isGas = !re.id.startsWith('@') && SUBSTANCES[re.id]?.state === 'g'
      if (isSolid || isGas) continue
      molar = Math.min(molar, available(v, re.id) / 1000 / litres(v))
    }
    const conc = hasWater && molar !== Infinity ? Math.max(0.08, Math.min(3, 0.25 + 0.75 * molar)) : 1
    const warm = Math.pow(1.6, (v.temp - ROOM) / 10)
    const extent = Math.min(maxExtent, r.rate * dt * conc * Math.min(6, warm))
    if (extent <= 0) continue
    for (const re of r.reactants) consume(v, re.id, re.n * extent)
    for (const p of r.products) produce(v, p.id, p.n * extent)
    if (r.heat) v.temp += (r.heat * extent) / Math.max(5, water(v) || 5) * 25
    const intensity = Math.min(1, extent / dt / Math.max(0.2, r.rate * 0.35))
    if (r.bubbles) {
      fx.bubbles = Math.max(fx.bubbles, intensity)
      fx.bubbleKind = r.bubbles
    }
    if (r.foam) fx.foam = Math.max(fx.foam, intensity)
    if (r.light) {
      fx.light = r.light
      fx.lightLevel = Math.max(fx.lightLevel, intensity)
    }
    if (r.flame) fx.flame = r.flame
    if (r.smoke) {
      fx.smoke = r.smoke
      fx.smokeLevel = Math.max(fx.smokeLevel, intensity)
    }
    if (r.sparks) fx.sparks = true
    if (r.sound) fx.sound = r.sound
    if (!v.seen.includes(r.id)) {
      v.seen.push(r.id)
      events.push({ vessel: v.id, kind: 'reaction', title: r.name, text: r.observation, equation: r.equation })
    }
  }

  // ---- gases: escape, or travel down a delivery tube
  for (const [g, n] of Object.entries(v.gas)) {
    if (n <= 0) continue
    if (deliver && v.deliverTo && g !== 'steam') {
      const moved = n * Math.min(1, dt * 2)
      deliver(g, moved)
    }
    v.gas[g] = n * Math.exp(-dt / 6)
    if (v.gas[g] < 1e-4) delete v.gas[g]
  }
  if ((v.gas.i2g ?? 0) > 0.01) {
    fx.smoke = [140, 40, 170]
    fx.smokeLevel = Math.max(fx.smokeLevel, Math.min(1, v.gas.i2g))
  }
  if ((v.gas.steam ?? 0) > 0.05) fx.steam = Math.max(fx.steam, Math.min(1, v.gas.steam / 3))

  // ---- heat and cooling
  const mass = Math.max(4, water(v) + (v.contents.ethanol ?? 0))
  if (v.heat > 0) {
    v.temp += (v.heat * 450 * dt) / mass
  }
  const boilAt = hasWater ? 100 : v.contents.ethanol ? 78 : 900
  if (v.temp > boilAt) {
    const excess = v.temp - boilAt
    v.temp = boilAt
    fx.boiling = true
    fx.bubbles = Math.max(fx.bubbles, 0.8)
    fx.bubbleKind = fx.bubbleKind ?? 'vigorous'
    fx.steam = Math.max(fx.steam, 0.9)
    // Boiling carries water away.
    const boiled = Math.min(water(v), excess * mass * 0.004 + dt * 0.4)
    if (hasWater) v.contents.h2o = water(v) - boiled
    if (!v.seen.includes('boil')) {
      v.seen.push('boil')
      events.push({ vessel: v.id, kind: 'boil', title: 'Boiling', text: `It boils at about ${Math.round(boilAt)} °C and steam rises.` })
    }
  } else if (v.temp > 70 && hasWater) {
    fx.steam = Math.max(fx.steam, (v.temp - 70) / 60)
  }
  v.temp += (ROOM - v.temp) * (1 - Math.exp(-dt / (v.heat > 0 ? 400 : 60)))
  v.temp = Math.max(-5, Math.min(1100, v.temp))

  // ---- precipitates settle
  for (const id of Object.keys(v.suspended)) {
    if (!(v.contents[id] > 0)) {
      delete v.suspended[id]
      continue
    }
    const stir = fx.bubbles > 0.4 || fx.boiling ? 0.35 : 0
    v.suspended[id] = Math.max(stir, v.suspended[id] * Math.exp(-dt / 14))
  }

  clean(v)
  v.fx = fx
  return events
}

/** Something with a flame colour in the vessel, for the flame test. */
export function flameColour(v: Vessel): { color: [number, number, number]; from: Substance } | null {
  let best: { color: [number, number, number]; from: Substance; n: number } | null = null
  for (const [id, n] of Object.entries(v.contents)) {
    const s = SUBSTANCES[id]
    if (s?.flame && n > 0.01 && (!best || n > best.n)) best = { color: s.flame, from: s, n }
  }
  return best ? { color: best.color, from: best.from } : null
}

// ---------------------------------------------------------------------- pH

export function pH(v: Vessel): number | null {
  if (!water(v)) return null
  const L = litres(v)
  let strongH = 0
  let weakH = 0
  let strongOH = 0
  let weakOH = 0
  for (const [id, n] of Object.entries(v.contents)) {
    const ions = IONS[id]
    if (!ions) continue
    if (ions['H+']) (WEAK.has(id) ? (weakH += n * ions['H+']) : (strongH += n * ions['H+']))
    if (ions['OH-']) (WEAK.has(id) ? (weakOH += n * ions['OH-']) : (strongOH += n * ions['OH-']))
    if (id === 'na2co3') weakOH += n
  }
  const h = strongH / 1000 / L
  const oh = strongOH / 1000 / L
  if (h > 1e-7) return Math.max(0, -Math.log10(h))
  if (oh > 1e-7) return Math.min(14, 14 + Math.log10(oh))
  if (weakH > 0) return Math.max(2.4, -Math.log10(Math.sqrt(1.8e-5 * (weakH / 1000 / L))))
  if (weakOH > 0) return Math.min(11.6, 14 + Math.log10(Math.sqrt(1.8e-5 * (weakOH / 1000 / L))))
  return 7
}

// ------------------------------------------------------------------ colour

type RGB = [number, number, number]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

function indicatorColour(id: string, p: number): { color: RGB; alpha: number } | null {
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  switch (id) {
    case 'litmus':
      return p < 5 ? { color: [215, 35, 60], alpha: 0.7 } : p > 8 ? { color: [45, 80, 205], alpha: 0.7 } : { color: mix([215, 35, 60], [45, 80, 205], clamp((p - 5) / 3)), alpha: 0.65 }
    case 'phenol':
      return p < 8.2 ? null : { color: [235, 40, 160], alpha: clamp((p - 8.2) / 1.8) * 0.85 }
    case 'morange':
      return p < 3.1 ? { color: [225, 40, 40], alpha: 0.7 } : p > 4.4 ? { color: [250, 200, 40], alpha: 0.65 } : { color: mix([225, 40, 40], [250, 200, 40], (p - 3.1) / 1.3), alpha: 0.7 }
    case 'univ': {
      const stops: Array<[number, RGB]> = [[1, [220, 30, 40]], [3, [245, 110, 30]], [5, [245, 210, 40]], [7, [60, 175, 70]], [9, [40, 120, 210]], [11, [70, 50, 170]], [13, [120, 40, 150]]]
      let c = stops[0][1]
      for (let i = 0; i < stops.length - 1; i++) {
        const [p0, c0] = stops[i]
        const [p1, c1] = stops[i + 1]
        if (p >= p0 && p <= p1) c = mix(c0, c1, (p - p0) / (p1 - p0))
        if (p > p1) c = c1
      }
      return { color: c, alpha: 0.75 }
    }
  }
  return null
}

export interface Appearance {
  /** Liquid colour and opacity. */
  liquid: { color: RGB; alpha: number }
  /** Milky cloudiness from suspended solid, and its colour. */
  cloud: { color: RGB; alpha: number }
  /** Solid lying at the bottom (settled precipitate, lumps, powders). */
  sediment: Array<{ id: string; color: RGB; amount: number; lumpy: boolean }>
  /** A substance floating on top (sodium, potassium). */
  floating: Array<{ id: string; color: RGB }>
  pH: number | null
}

/** What the vessel looks like: blended liquid colour, cloudiness, sediment. */
export function appearance(v: Vessel): Appearance {
  const L = litres(v)
  const p = pH(v)
  let r = 0
  let g = 0
  let b = 0
  let w = 0
  let clear = 1
  for (const [id, n] of Object.entries(v.contents)) {
    const s = SUBSTANCES[id]
    if (!s || s.state === 's' || id === 'h2o') continue
    let color = s.color
    let alpha = s.alpha
    if (s.kind === 'indicator' && p != null) {
      const ic = indicatorColour(id, p)
      if (!ic) continue
      color = ic.color
      alpha = ic.alpha
    }
    // Strength grows with concentration, then saturates.
    const conc = n / 1000 / L
    const a = alpha * (1 - Math.exp(-conc * (s.kind === 'indicator' ? 600 : s.kind === 'complex' ? 400 : 9)))
    if (a <= 0.002) continue
    r += color[0] * a
    g += color[1] * a
    b += color[2] * a
    w += a
    clear *= 1 - a
  }
  const liquid = w > 0 ? { color: [r / w, g / w, b / w] as RGB, alpha: Math.min(0.96, 1 - clear) } : { color: [225, 238, 252] as RGB, alpha: 0.12 }

  let cr = 0
  let cg = 0
  let cb = 0
  let cw = 0
  const sediment: Appearance['sediment'] = []
  const floating: Appearance['floating'] = []
  for (const [id, n] of Object.entries(v.contents)) {
    const s = SUBSTANCES[id]
    if (!s || s.state !== 's' || n <= 0.001) continue
    if ((id === 'na' || id === 'k') && water(v)) {
      floating.push({ id, color: s.color })
      continue
    }
    if (id === 'foam') continue
    const sus = v.suspended[id] ?? 0
    const lumpy = ['mg', 'zn', 'fe', 'cu', 'al', 'ag', 'ca', 'caco3', 'cuso4_5h2o', 'naoh_s', 'i2'].includes(id)
    if (sus > 0 && water(v)) {
      const a = Math.min(0.9, (n / 1000 / L) * 60) * sus
      cr += s.color[0] * a
      cg += s.color[1] * a
      cb += s.color[2] * a
      cw += a
    }
    sediment.push({ id, color: s.color, amount: n * (1 - sus), lumpy })
  }
  const cloud = cw > 0 ? { color: [cr / cw, cg / cw, cb / cw] as RGB, alpha: Math.min(0.92, cw) } : { color: [255, 255, 255] as RGB, alpha: 0 }
  return { liquid, cloud, sediment, floating, pH: p }
}

// ----------------------------------------------------------------- tests

export type SplintResult = 'relights' | 'pop' | 'goes-out' | 'nothing'

/** Hold a splint at the mouth of the vessel. */
export function splintTest(v: Vessel, kind: 'glowing' | 'burning'): { result: SplintResult; text: string } {
  const o2 = v.gas.o2 ?? 0
  const h2 = v.gas.h2 ?? 0
  const co2 = v.gas.co2 ?? 0
  if (kind === 'burning' && h2 > 0.05) return { result: 'pop', text: 'A squeaky pop! The gas is hydrogen.' }
  if (kind === 'glowing' && o2 > 0.05) return { result: 'relights', text: 'The glowing splint bursts back into flame. The gas is oxygen.' }
  if (kind === 'burning' && co2 > 0.05) return { result: 'goes-out', text: 'The flame goes out. Carbon dioxide does not support burning — confirm it with limewater.' }
  if (kind === 'burning' && o2 > 0.05) return { result: 'relights', text: 'The flame burns more brightly in the oxygen.' }
  return { result: 'nothing', text: kind === 'glowing' ? 'The splint keeps glowing faintly — no oxygen here.' : 'The splint just keeps burning — no test gas here.' }
}

/** Hold damp litmus paper at the mouth (gas) or dip it (liquid). */
export function litmusPaper(v: Vessel, colour: 'red' | 'blue'): { turns: 'red' | 'blue' | null; text: string } {
  if ((v.gas.nh3g ?? 0) > 0.02) return { turns: colour === 'red' ? 'blue' : null, text: colour === 'red' ? 'The damp red litmus turns blue — ammonia gas, an alkali.' : 'Blue litmus stays blue.' }
  const p = pH(v)
  if (p == null) return { turns: null, text: 'There is nothing to wet the paper.' }
  if (p < 6 && colour === 'blue') return { turns: 'red', text: `Blue litmus turns red — acidic (pH about ${p.toFixed(1)}).` }
  if (p > 8 && colour === 'red') return { turns: 'blue', text: `Red litmus turns blue — alkaline (pH about ${p.toFixed(1)}).` }
  return { turns: null, text: `No change (pH about ${p.toFixed(1)}).` }
}

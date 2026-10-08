/**
 * Every substance the lab knows: what it looks like, how it behaves in water,
 * and the facts the reaction engine and the indicators read.
 *
 * Amounts in the simulation are millimoles (mmol) for reacting species and
 * millilitres for water, so a bottle of "1 M hydrochloric acid" poured 10 mL
 * adds 10 mL of water and 10 mmol of HCl. Solids are measured in grams and
 * converted with their molar mass.
 */

export type State = 's' | 'l' | 'aq' | 'g'
export type Kind =
  | 'water' | 'acid' | 'base' | 'salt' | 'metal' | 'nonmetal' | 'oxide' | 'carbonate'
  | 'indicator' | 'organic' | 'peroxide' | 'gas' | 'complex' | 'other'

export interface Substance {
  id: string
  name: string
  formula: string
  state: State
  kind: Kind
  /** Colour as [r, g, b] 0–255; `alpha` is how strongly it tints (0 clear – 1 opaque). */
  color: [number, number, number]
  alpha: number
  /** g/mol, for solids weighed out on the spatula. */
  molarMass?: number
  /** Strong acid: H⁺ per mmol; strong base: OH⁻ per mmol; weak ones have `weak`. */
  acid?: number
  base?: number
  weak?: boolean
  /** Insoluble solids settle as a precipitate or sit as lumps. */
  insoluble?: boolean
  /** Colour a flame turns when this is held in it. */
  flame?: [number, number, number]
  /** Heat released (+) or absorbed (−) when 1 mmol dissolves, in arbitrary °C·mL units. */
  dissolveHeat?: number
  hazard?: string
  description?: string
}

/** Bottles and jars in the cabinet: what is added, at what strength. */
export interface Reagent {
  id: string
  label: string
  /** The substance delivered (plus water for solutions). */
  substance: string
  /** Solutions: mol/L. Liquids added in mL; solids in grams. */
  molarity?: number
  form: 'solution' | 'liquid' | 'solid'
  shelf: 'acids' | 'bases' | 'salts' | 'metals' | 'indicators' | 'solids' | 'other'
  hazard?: string
}

const S = (s: Substance) => s

export const SUBSTANCES: Record<string, Substance> = Object.fromEntries(
  [
    S({ id: 'h2o', name: 'Water', formula: 'H₂O', state: 'l', kind: 'water', color: [200, 230, 255], alpha: 0.05 }),

    // Acids
    S({ id: 'hcl', name: 'Hydrochloric acid', formula: 'HCl', state: 'aq', kind: 'acid', color: [240, 250, 255], alpha: 0.02, acid: 1, hazard: 'Corrosive' }),
    S({ id: 'h2so4', name: 'Sulfuric acid', formula: 'H₂SO₄', state: 'aq', kind: 'acid', color: [240, 250, 255], alpha: 0.02, acid: 2, hazard: 'Corrosive', dissolveHeat: 0.6 }),
    S({ id: 'hno3', name: 'Nitric acid', formula: 'HNO₃', state: 'aq', kind: 'acid', color: [250, 250, 235], alpha: 0.04, acid: 1, hazard: 'Corrosive, oxidiser' }),
    S({ id: 'ch3cooh', name: 'Ethanoic acid (vinegar)', formula: 'CH₃COOH', state: 'aq', kind: 'acid', color: [250, 250, 240], alpha: 0.03, acid: 1, weak: true }),

    // Bases and alkalis
    S({ id: 'naoh', name: 'Sodium hydroxide', formula: 'NaOH', state: 'aq', kind: 'base', color: [245, 248, 255], alpha: 0.02, base: 1, molarMass: 40, hazard: 'Corrosive', dissolveHeat: 0.45 }),
    S({ id: 'koh', name: 'Potassium hydroxide', formula: 'KOH', state: 'aq', kind: 'base', color: [245, 248, 255], alpha: 0.02, base: 1, hazard: 'Corrosive' }),
    S({ id: 'caoh2', name: 'Calcium hydroxide (limewater)', formula: 'Ca(OH)₂', state: 'aq', kind: 'base', color: [245, 248, 255], alpha: 0.03, base: 2 }),
    S({ id: 'nh3', name: 'Ammonia solution', formula: 'NH₃', state: 'aq', kind: 'base', color: [245, 250, 255], alpha: 0.02, base: 1, weak: true, hazard: 'Irritant' }),

    // Salts in solution
    S({ id: 'nacl', name: 'Sodium chloride', formula: 'NaCl', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, molarMass: 58.4, flame: [255, 200, 40] }),
    S({ id: 'kcl', name: 'Potassium chloride', formula: 'KCl', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [200, 140, 255] }),
    S({ id: 'licl', name: 'Lithium chloride', formula: 'LiCl', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [235, 30, 60] }),
    S({ id: 'cacl2', name: 'Calcium chloride', formula: 'CaCl₂', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [255, 110, 40], dissolveHeat: 0.3 }),
    S({ id: 'srcl2', name: 'Strontium chloride', formula: 'SrCl₂', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [230, 20, 30] }),
    S({ id: 'bacl2', name: 'Barium chloride', formula: 'BaCl₂', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [140, 230, 80], hazard: 'Toxic' }),
    S({ id: 'agno3', name: 'Silver nitrate', formula: 'AgNO₃', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, hazard: 'Stains skin' }),
    S({ id: 'pbno32', name: 'Lead(II) nitrate', formula: 'Pb(NO₃)₂', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, hazard: 'Toxic' }),
    S({ id: 'ki', name: 'Potassium iodide', formula: 'KI', state: 'aq', kind: 'salt', color: [255, 255, 250], alpha: 0.01, flame: [200, 140, 255] }),
    S({ id: 'na2so4', name: 'Sodium sulfate', formula: 'Na₂SO₄', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [255, 200, 40] }),
    S({ id: 'na2co3', name: 'Sodium carbonate', formula: 'Na₂CO₃', state: 'aq', kind: 'carbonate', color: [255, 255, 255], alpha: 0.01, base: 1, weak: true, flame: [255, 200, 40] }),
    S({ id: 'cuso4', name: 'Copper(II) sulfate', formula: 'CuSO₄', state: 'aq', kind: 'salt', color: [40, 130, 235], alpha: 0.55, flame: [60, 210, 170] }),
    S({ id: 'cucl2', name: 'Copper(II) chloride', formula: 'CuCl₂', state: 'aq', kind: 'salt', color: [40, 170, 200], alpha: 0.5, flame: [60, 210, 170] }),
    S({ id: 'feso4', name: 'Iron(II) sulfate', formula: 'FeSO₄', state: 'aq', kind: 'salt', color: [150, 210, 150], alpha: 0.3 }),
    S({ id: 'fecl2', name: 'Iron(II) chloride', formula: 'FeCl₂', state: 'aq', kind: 'salt', color: [160, 215, 150], alpha: 0.28 }),
    S({ id: 'fecl3', name: 'Iron(III) chloride', formula: 'FeCl₃', state: 'aq', kind: 'salt', color: [215, 150, 30], alpha: 0.5, hazard: 'Corrosive' }),
    S({ id: 'kscn', name: 'Potassium thiocyanate', formula: 'KSCN', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [200, 140, 255] }),
    S({ id: 'kmno4', name: 'Potassium manganate(VII)', formula: 'KMnO₄', state: 'aq', kind: 'salt', color: [130, 20, 140], alpha: 0.85, hazard: 'Oxidiser, stains' }),
    S({ id: 'na2s2o3', name: 'Sodium thiosulfate', formula: 'Na₂S₂O₃', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01 }),
    S({ id: 'nh4cl', name: 'Ammonium chloride', formula: 'NH₄Cl', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, molarMass: 53.5, dissolveHeat: -0.55 }),
    S({ id: 'mgcl2', name: 'Magnesium chloride', formula: 'MgCl₂', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01 }),
    S({ id: 'zncl2', name: 'Zinc chloride', formula: 'ZnCl₂', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01 }),
    S({ id: 'znso4', name: 'Zinc sulfate', formula: 'ZnSO₄', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01 }),
    S({ id: 'mgso4', name: 'Magnesium sulfate', formula: 'MgSO₄', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01 }),
    S({ id: 'nano3', name: 'Sodium nitrate', formula: 'NaNO₃', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [255, 200, 40] }),
    S({ id: 'kno3', name: 'Potassium nitrate', formula: 'KNO₃', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01, flame: [200, 140, 255] }),
    S({ id: 'cuno32', name: 'Copper(II) nitrate', formula: 'Cu(NO₃)₂', state: 'aq', kind: 'salt', color: [40, 140, 230], alpha: 0.5, flame: [60, 210, 170] }),
    S({ id: 'mnso4', name: 'Manganese(II) sulfate', formula: 'MnSO₄', state: 'aq', kind: 'salt', color: [255, 225, 230], alpha: 0.06 }),
    S({ id: 'fe2so43', name: 'Iron(III) sulfate', formula: 'Fe₂(SO₄)₃', state: 'aq', kind: 'salt', color: [220, 170, 60], alpha: 0.35 }),
    S({ id: 'fescn', name: 'Iron(III) thiocyanate', formula: '[Fe(SCN)]²⁺', state: 'aq', kind: 'complex', color: [150, 10, 20], alpha: 0.95 }),
    S({ id: 'nh4oh', name: 'Ammonium (spent)', formula: 'NH₄⁺', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01 }),
    S({ id: 'naac', name: 'Sodium ethanoate', formula: 'CH₃COONa', state: 'aq', kind: 'salt', color: [255, 255, 255], alpha: 0.01 }),

    // Indicators and test reagents
    S({ id: 'litmus', name: 'Litmus', formula: 'litmus', state: 'aq', kind: 'indicator', color: [150, 80, 170], alpha: 0.5 }),
    S({ id: 'phenol', name: 'Phenolphthalein', formula: 'phph', state: 'aq', kind: 'indicator', color: [255, 255, 255], alpha: 0.0 }),
    S({ id: 'univ', name: 'Universal indicator', formula: 'UI', state: 'aq', kind: 'indicator', color: [60, 170, 60], alpha: 0.55 }),
    S({ id: 'morange', name: 'Methyl orange', formula: 'MO', state: 'aq', kind: 'indicator', color: [250, 160, 40], alpha: 0.6 }),
    S({ id: 'starch', name: 'Starch solution', formula: '(C₆H₁₀O₅)ₙ', state: 'aq', kind: 'organic', color: [250, 250, 245], alpha: 0.08 }),
    S({ id: 'iodine', name: 'Iodine solution', formula: 'I₂ (in KI)', state: 'aq', kind: 'other', color: [150, 70, 20], alpha: 0.7, hazard: 'Stains' }),
    S({ id: 'starchI', name: 'Starch–iodine complex', formula: 'I₂·starch', state: 'aq', kind: 'complex', color: [20, 15, 60], alpha: 0.97 }),

    // Peroxide and organics
    S({ id: 'h2o2', name: 'Hydrogen peroxide', formula: 'H₂O₂', state: 'aq', kind: 'peroxide', color: [250, 252, 255], alpha: 0.02, hazard: 'Oxidiser' }),
    S({ id: 'soap', name: 'Washing-up liquid', formula: 'detergent', state: 'aq', kind: 'organic', color: [120, 220, 120], alpha: 0.25 }),
    S({ id: 'ethanol', name: 'Ethanol', formula: 'C₂H₅OH', state: 'l', kind: 'organic', color: [250, 252, 255], alpha: 0.02, hazard: 'Flammable' }),
    S({ id: 'sugar', name: 'Sucrose', formula: 'C₁₂H₂₂O₁₁', state: 's', kind: 'organic', color: [252, 252, 250], alpha: 0.9, molarMass: 342 }),
    S({ id: 'starchpow', name: 'Starch powder', formula: '(C₆H₁₀O₅)ₙ', state: 's', kind: 'organic', color: [250, 250, 240], alpha: 0.9, molarMass: 162 }),

    // Metals (solids)
    S({ id: 'mg', name: 'Magnesium ribbon', formula: 'Mg', state: 's', kind: 'metal', color: [200, 205, 210], alpha: 1, molarMass: 24.3, insoluble: true }),
    S({ id: 'zn', name: 'Zinc granules', formula: 'Zn', state: 's', kind: 'metal', color: [170, 178, 185], alpha: 1, molarMass: 65.4, insoluble: true }),
    S({ id: 'fe', name: 'Iron filings', formula: 'Fe', state: 's', kind: 'metal', color: [90, 90, 95], alpha: 1, molarMass: 55.8, insoluble: true }),
    S({ id: 'cu', name: 'Copper', formula: 'Cu', state: 's', kind: 'metal', color: [190, 95, 50], alpha: 1, molarMass: 63.5, insoluble: true, flame: [60, 210, 170] }),
    S({ id: 'al', name: 'Aluminium foil', formula: 'Al', state: 's', kind: 'metal', color: [215, 220, 225], alpha: 1, molarMass: 27, insoluble: true }),
    S({ id: 'ag', name: 'Silver crystals', formula: 'Ag', state: 's', kind: 'metal', color: [220, 222, 228], alpha: 1, insoluble: true }),
    S({ id: 'na', name: 'Sodium', formula: 'Na', state: 's', kind: 'metal', color: [215, 215, 205], alpha: 1, molarMass: 23, insoluble: true, flame: [255, 200, 40], hazard: 'Reacts violently with water' }),
    S({ id: 'k', name: 'Potassium', formula: 'K', state: 's', kind: 'metal', color: [210, 210, 200], alpha: 1, molarMass: 39.1, insoluble: true, flame: [200, 140, 255], hazard: 'Reacts violently with water' }),
    S({ id: 'ca', name: 'Calcium', formula: 'Ca', state: 's', kind: 'metal', color: [225, 225, 220], alpha: 1, molarMass: 40.1, insoluble: true, flame: [255, 110, 40] }),

    // Other solids
    S({ id: 'caco3', name: 'Marble chips', formula: 'CaCO₃', state: 's', kind: 'carbonate', color: [240, 238, 232], alpha: 1, molarMass: 100, insoluble: true }),
    S({ id: 'nahco3', name: 'Sodium hydrogencarbonate', formula: 'NaHCO₃', state: 's', kind: 'carbonate', color: [252, 252, 252], alpha: 1, molarMass: 84 }),
    S({ id: 'cuco3', name: 'Copper(II) carbonate', formula: 'CuCO₃', state: 's', kind: 'carbonate', color: [80, 170, 120], alpha: 1, molarMass: 123.6, insoluble: true }),
    S({ id: 'mno2', name: 'Manganese(IV) oxide', formula: 'MnO₂', state: 's', kind: 'oxide', color: [30, 28, 28], alpha: 1, molarMass: 86.9, insoluble: true }),
    S({ id: 'cuso4_5h2o', name: 'Copper(II) sulfate crystals', formula: 'CuSO₄·5H₂O', state: 's', kind: 'salt', color: [30, 110, 230], alpha: 1, molarMass: 249.7 }),
    S({ id: 'cuso4_anh', name: 'Anhydrous copper(II) sulfate', formula: 'CuSO₄', state: 's', kind: 'salt', color: [235, 235, 228], alpha: 1, molarMass: 159.6 }),
    S({ id: 'naoh_s', name: 'Sodium hydroxide pellets', formula: 'NaOH', state: 's', kind: 'base', color: [250, 250, 250], alpha: 1, molarMass: 40, hazard: 'Corrosive' }),
    S({ id: 'nh4cl_s', name: 'Ammonium chloride', formula: 'NH₄Cl', state: 's', kind: 'salt', color: [252, 252, 252], alpha: 1, molarMass: 53.5 }),
    S({ id: 'i2', name: 'Iodine crystals', formula: 'I₂', state: 's', kind: 'nonmetal', color: [60, 40, 70], alpha: 1, molarMass: 253.8, insoluble: true }),
    S({ id: 's8', name: 'Sulfur', formula: 'S', state: 's', kind: 'nonmetal', color: [240, 215, 40], alpha: 1, molarMass: 32, insoluble: true }),

    // Products that appear during reactions
    S({ id: 'agcl', name: 'Silver chloride', formula: 'AgCl', state: 's', kind: 'salt', color: [248, 248, 248], alpha: 1, insoluble: true }),
    S({ id: 'agi', name: 'Silver iodide', formula: 'AgI', state: 's', kind: 'salt', color: [245, 235, 160], alpha: 1, insoluble: true }),
    S({ id: 'baso4', name: 'Barium sulfate', formula: 'BaSO₄', state: 's', kind: 'salt', color: [250, 250, 250], alpha: 1, insoluble: true }),
    S({ id: 'pbi2', name: 'Lead(II) iodide', formula: 'PbI₂', state: 's', kind: 'salt', color: [250, 205, 20], alpha: 1, insoluble: true }),
    S({ id: 'cuoh2', name: 'Copper(II) hydroxide', formula: 'Cu(OH)₂', state: 's', kind: 'base', color: [60, 140, 230], alpha: 1, insoluble: true }),
    S({ id: 'feoh3', name: 'Iron(III) hydroxide', formula: 'Fe(OH)₃', state: 's', kind: 'base', color: [165, 75, 25], alpha: 1, insoluble: true }),
    S({ id: 'feoh2', name: 'Iron(II) hydroxide', formula: 'Fe(OH)₂', state: 's', kind: 'base', color: [70, 110, 70], alpha: 1, insoluble: true }),
    S({ id: 'cuo', name: 'Copper(II) oxide', formula: 'CuO', state: 's', kind: 'oxide', color: [30, 25, 25], alpha: 1, insoluble: true }),
    S({ id: 'mgo', name: 'Magnesium oxide', formula: 'MgO', state: 's', kind: 'oxide', color: [250, 250, 248], alpha: 1, insoluble: true }),
    S({ id: 'caco3ppt', name: 'Calcium carbonate', formula: 'CaCO₃', state: 's', kind: 'carbonate', color: [250, 250, 250], alpha: 1, insoluble: true }),
    S({ id: 'sppt', name: 'Sulfur (colloidal)', formula: 'S', state: 's', kind: 'nonmetal', color: [245, 230, 120], alpha: 1, insoluble: true }),
    S({ id: 'foam', name: 'Oxygen foam', formula: 'O₂ + soap', state: 's', kind: 'other', color: [255, 250, 235], alpha: 1, insoluble: true }),

    // Gases
    S({ id: 'h2', name: 'Hydrogen', formula: 'H₂', state: 'g', kind: 'gas', color: [255, 255, 255], alpha: 0 }),
    S({ id: 'o2', name: 'Oxygen', formula: 'O₂', state: 'g', kind: 'gas', color: [255, 255, 255], alpha: 0 }),
    S({ id: 'co2', name: 'Carbon dioxide', formula: 'CO₂', state: 'g', kind: 'gas', color: [255, 255, 255], alpha: 0 }),
    S({ id: 'so2', name: 'Sulfur dioxide', formula: 'SO₂', state: 'g', kind: 'gas', color: [255, 255, 255], alpha: 0, hazard: 'Toxic' }),
    S({ id: 'nh3g', name: 'Ammonia gas', formula: 'NH₃', state: 'g', kind: 'gas', color: [255, 255, 255], alpha: 0, hazard: 'Pungent' }),
    S({ id: 'steam', name: 'Steam', formula: 'H₂O(g)', state: 'g', kind: 'gas', color: [255, 255, 255], alpha: 0 }),
    S({ id: 'i2g', name: 'Iodine vapour', formula: 'I₂(g)', state: 'g', kind: 'gas', color: [140, 40, 170], alpha: 0.6 }),
  ].map((s) => [s.id, s]),
)

export const REAGENTS: Reagent[] = [
  { id: 'r_water', label: 'Distilled water', substance: 'h2o', form: 'liquid', shelf: 'other' },
  { id: 'r_hcl', label: 'Hydrochloric acid 1 M', substance: 'hcl', molarity: 1, form: 'solution', shelf: 'acids', hazard: 'Corrosive' },
  { id: 'r_h2so4', label: 'Sulfuric acid 1 M', substance: 'h2so4', molarity: 1, form: 'solution', shelf: 'acids', hazard: 'Corrosive' },
  { id: 'r_hno3', label: 'Nitric acid 1 M', substance: 'hno3', molarity: 1, form: 'solution', shelf: 'acids', hazard: 'Corrosive' },
  { id: 'r_vinegar', label: 'Vinegar (ethanoic acid)', substance: 'ch3cooh', molarity: 0.8, form: 'solution', shelf: 'acids' },
  { id: 'r_naoh', label: 'Sodium hydroxide 1 M', substance: 'naoh', molarity: 1, form: 'solution', shelf: 'bases', hazard: 'Corrosive' },
  { id: 'r_koh', label: 'Potassium hydroxide 1 M', substance: 'koh', molarity: 1, form: 'solution', shelf: 'bases', hazard: 'Corrosive' },
  { id: 'r_lime', label: 'Limewater', substance: 'caoh2', molarity: 0.02, form: 'solution', shelf: 'bases' },
  { id: 'r_nh3', label: 'Ammonia solution 1 M', substance: 'nh3', molarity: 1, form: 'solution', shelf: 'bases' },
  { id: 'r_nacl', label: 'Sodium chloride 0.5 M', substance: 'nacl', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_kcl', label: 'Potassium chloride 0.5 M', substance: 'kcl', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_licl', label: 'Lithium chloride 0.5 M', substance: 'licl', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_cacl2', label: 'Calcium chloride 0.5 M', substance: 'cacl2', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_srcl2', label: 'Strontium chloride 0.5 M', substance: 'srcl2', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_bacl2', label: 'Barium chloride 0.5 M', substance: 'bacl2', molarity: 0.5, form: 'solution', shelf: 'salts', hazard: 'Toxic' },
  { id: 'r_agno3', label: 'Silver nitrate 0.1 M', substance: 'agno3', molarity: 0.1, form: 'solution', shelf: 'salts' },
  { id: 'r_pbno32', label: 'Lead(II) nitrate 0.5 M', substance: 'pbno32', molarity: 0.5, form: 'solution', shelf: 'salts', hazard: 'Toxic' },
  { id: 'r_ki', label: 'Potassium iodide 0.5 M', substance: 'ki', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_na2so4', label: 'Sodium sulfate 0.5 M', substance: 'na2so4', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_na2co3', label: 'Sodium carbonate 0.5 M', substance: 'na2co3', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_cuso4', label: 'Copper(II) sulfate 0.5 M', substance: 'cuso4', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_feso4', label: 'Iron(II) sulfate 0.5 M', substance: 'feso4', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_fecl3', label: 'Iron(III) chloride 0.5 M', substance: 'fecl3', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_kscn', label: 'Potassium thiocyanate 0.5 M', substance: 'kscn', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_kmno4', label: 'Potassium manganate(VII) 0.02 M', substance: 'kmno4', molarity: 0.02, form: 'solution', shelf: 'salts' },
  { id: 'r_na2s2o3', label: 'Sodium thiosulfate 0.5 M', substance: 'na2s2o3', molarity: 0.5, form: 'solution', shelf: 'salts' },
  { id: 'r_litmus', label: 'Litmus solution', substance: 'litmus', molarity: 0.05, form: 'solution', shelf: 'indicators' },
  { id: 'r_phenol', label: 'Phenolphthalein', substance: 'phenol', molarity: 0.05, form: 'solution', shelf: 'indicators' },
  { id: 'r_univ', label: 'Universal indicator', substance: 'univ', molarity: 0.05, form: 'solution', shelf: 'indicators' },
  { id: 'r_morange', label: 'Methyl orange', substance: 'morange', molarity: 0.05, form: 'solution', shelf: 'indicators' },
  { id: 'r_starch', label: 'Starch solution', substance: 'starch', molarity: 0.2, form: 'solution', shelf: 'indicators' },
  { id: 'r_iodine', label: 'Iodine solution', substance: 'iodine', molarity: 0.05, form: 'solution', shelf: 'indicators' },
  { id: 'r_h2o2', label: 'Hydrogen peroxide 6%', substance: 'h2o2', molarity: 1.8, form: 'solution', shelf: 'other', hazard: 'Oxidiser' },
  { id: 'r_soap', label: 'Washing-up liquid', substance: 'soap', molarity: 0.5, form: 'solution', shelf: 'other' },
  { id: 'r_ethanol', label: 'Ethanol', substance: 'ethanol', form: 'liquid', shelf: 'other', hazard: 'Flammable' },
  { id: 'r_mg', label: 'Magnesium ribbon', substance: 'mg', form: 'solid', shelf: 'metals' },
  { id: 'r_zn', label: 'Zinc granules', substance: 'zn', form: 'solid', shelf: 'metals' },
  { id: 'r_fe', label: 'Iron filings', substance: 'fe', form: 'solid', shelf: 'metals' },
  { id: 'r_cu', label: 'Copper turnings', substance: 'cu', form: 'solid', shelf: 'metals' },
  { id: 'r_al', label: 'Aluminium foil', substance: 'al', form: 'solid', shelf: 'metals' },
  { id: 'r_na', label: 'Sodium (under oil)', substance: 'na', form: 'solid', shelf: 'metals', hazard: 'Violent with water' },
  { id: 'r_k', label: 'Potassium (under oil)', substance: 'k', form: 'solid', shelf: 'metals', hazard: 'Violent with water' },
  { id: 'r_ca', label: 'Calcium granules', substance: 'ca', form: 'solid', shelf: 'metals' },
  { id: 'r_caco3', label: 'Marble chips', substance: 'caco3', form: 'solid', shelf: 'solids' },
  { id: 'r_nahco3', label: 'Baking soda', substance: 'nahco3', form: 'solid', shelf: 'solids' },
  { id: 'r_cuco3', label: 'Copper(II) carbonate', substance: 'cuco3', form: 'solid', shelf: 'solids' },
  { id: 'r_mno2', label: 'Manganese(IV) oxide', substance: 'mno2', form: 'solid', shelf: 'solids' },
  { id: 'r_cuso4s', label: 'Copper sulfate crystals', substance: 'cuso4_5h2o', form: 'solid', shelf: 'solids' },
  { id: 'r_cuso4a', label: 'Anhydrous copper sulfate', substance: 'cuso4_anh', form: 'solid', shelf: 'solids' },
  { id: 'r_naohs', label: 'Sodium hydroxide pellets', substance: 'naoh_s', form: 'solid', shelf: 'solids', hazard: 'Corrosive' },
  { id: 'r_nh4cls', label: 'Ammonium chloride', substance: 'nh4cl_s', form: 'solid', shelf: 'solids' },
  { id: 'r_i2', label: 'Iodine crystals', substance: 'i2', form: 'solid', shelf: 'solids' },
  { id: 'r_sugar', label: 'Sugar', substance: 'sugar', form: 'solid', shelf: 'solids' },
  { id: 'r_starchpow', label: 'Starch powder', substance: 'starchpow', form: 'solid', shelf: 'solids' },
  { id: 'r_s', label: 'Sulfur powder', substance: 's8', form: 'solid', shelf: 'solids' },
]

export const REAGENT_BY_ID: Record<string, Reagent> = Object.fromEntries(REAGENTS.map((r) => [r.id, r]))

export function substance(id: string): Substance {
  return SUBSTANCES[id] ?? { id, name: id, formula: id, state: 'aq', kind: 'other', color: [255, 255, 255], alpha: 0.02 }
}
